// Canvas output dimensions (px)
export const CANVAS_W = 1456;
export const CANVAS_H = 950;

// Feature image placement
export const FEATURE_SIZE = 950;
export const FEATURE_X = 484;
export const FEATURE_Y = 0;

// Frame variants and animation sequence (B → A → B → C, loops indefinitely)
export type FrameVariant = 'A' | 'B' | 'C';
export const ANIMATION_SEQUENCE: FrameVariant[] = ['B', 'A', 'B', 'C'];

// Asset URLs — files must be placed in public/assets/
const ASSET_PATHS = {
  frameA:       '/assets/frame_A_neutral.png',
  frameB:       '/assets/frame_B_neutral.png',
  frameC:       '/assets/frame_C_neutral.png',
  textFillA:    '/assets/text_A_fill.png',
  textFillB:    '/assets/text_B_fill.png',
  textFillC:    '/assets/text_C_fill.png',
  textOutlineA: '/assets/text_A_outline.png',
  textOutlineB: '/assets/text_B_outline.png',
  textOutlineC: '/assets/text_C_outline.png',
  logo:         '/assets/so_logo_white.png',
} as const;

type AssetKey = keyof typeof ASSET_PATHS;

// ─── Image loading ────────────────────────────────────────────────────────────

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

// ─── Asset cache ──────────────────────────────────────────────────────────────

const assetCache = new Map<AssetKey, HTMLImageElement>();

export async function preloadAssets(): Promise<void> {
  await Promise.all(
    (Object.entries(ASSET_PATHS) as [AssetKey, string][]).map(
      async ([key, path]) => {
        const img = await loadImage(path);
        assetCache.set(key, img);
      }
    )
  );
}

function getAsset(key: AssetKey): HTMLImageElement | undefined {
  return assetCache.get(key);
}

// ─── Tinting ─────────────────────────────────────────────────────────────────

/**
 * Returns an offscreen canvas with the neutral PNG asset tinted to `color`.
 *
 * Both paths start identically: fill solid color at full strength, then clip
 * to the asset's alpha channel (same approach as the text fill).
 *
 * - preserveLuminance=false (text fill) → stops there: flat vibrant color.
 *
 * - preserveLuminance=true  (frame) → one extra step: re-draw the neutral
 *   asset on top with 'overlay' blend mode.
 *
 *   Why overlay works perfectly for a #7f7f7f (50% gray) base:
 *   The overlay formula collapses to identity at exactly 0.5 gray, so the
 *   solid tint colour is preserved at full vibrancy. Pixels darker than 50%
 *   pull the colour slightly darker; pixels lighter than 50% push it slightly
 *   lighter — producing visible grain/texture with zero net colour shift.
 */
function tintAsset(
  asset: HTMLImageElement,
  color: string,
  w: number,
  h: number,
  preserveLuminance: boolean,
): HTMLCanvasElement {
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const ctx = off.getContext('2d')!;

  // Step 1: solid colour fill at full strength.
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);

  // Step 2: clip to the asset's alpha channel.
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(asset, 0, 0);

  if (preserveLuminance) {
    // Step 3 (frame only): overlay the neutral asset to restore grain/texture.
    // At 50% gray the overlay formula = identity → colour stays vibrant.
    // Grain deviations above/below 50% create the subtle texture effect.
    ctx.globalCompositeOperation = 'overlay';
    ctx.drawImage(asset, 0, 0);
  }

  return off;
}

// ─── Compositing ──────────────────────────────────────────────────────────────

export interface RenderParams {
  canvas: HTMLCanvasElement;
  featureImage: HTMLImageElement | null;
  textColor: string;
  frameColor: string;
}

/**
 * Renders one frame variant onto `canvas` following the spec compositing order:
 *   1. Feature image at (484, 0) → 950×950  (static across all variants)
 *   2. Tinted frame overlay (preserves grain) — variant-specific
 *   3. Tinted text fill (solid color) — variant-specific
 *   4. White text outline (as-is) — variant-specific
 *   5. White logo (as-is, static across all variants)
 */
export function renderFrameVariant({
  canvas,
  featureImage,
  textColor,
  frameColor,
  variant = 'A',
}: RenderParams & { variant?: FrameVariant }): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // 1. Feature image (static)
  if (featureImage) {
    ctx.drawImage(featureImage, FEATURE_X, FEATURE_Y, FEATURE_SIZE, FEATURE_SIZE);
  }

  // 2. Frame overlay — tinted, luminance-preserving
  const frame = getAsset(`frame${variant}` as AssetKey);
  if (frame) {
    ctx.drawImage(tintAsset(frame, frameColor, CANVAS_W, CANVAS_H, true), 0, 0);
  }

  // 3. Text fill — tinted, solid color
  const textFill = getAsset(`textFill${variant}` as AssetKey);
  if (textFill) {
    ctx.drawImage(tintAsset(textFill, textColor, CANVAS_W, CANVAS_H, false), 0, 0);
  }

  // 4. Text outline — white, drawn as-is (no tint)
  const textOutline = getAsset(`textOutline${variant}` as AssetKey);
  if (textOutline) {
    ctx.drawImage(textOutline, 0, 0);
  }

  // 5. Logo — white, drawn as-is (static)
  const logo = getAsset('logo');
  if (logo) {
    ctx.drawImage(logo, 0, 0);
  }
}

/**
 * Renders the A-variant (still/default) frame. Backward-compatible alias.
 */
export function renderFrame(params: RenderParams): void {
  renderFrameVariant({ ...params, variant: 'A' });
}

// ─── Export ───────────────────────────────────────────────────────────────────

/**
 * Re-renders A variant onto `canvas` and downloads as PNG.
 * Still export always uses A variants per spec.
 */
export function exportPNG(
  canvas: HTMLCanvasElement,
  featureImage: HTMLImageElement | null,
  textColor: string,
  frameColor: string,
  issueNumber: string,
): void {
  renderFrameVariant({ canvas, featureImage, textColor, frameColor, variant: 'A' });
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TheFridayMixer-${issueNumber}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}

/**
 * Encodes and downloads a 4-frame animated GIF (B → A → B → C).
 * Each frame uses the same tinting logic as the still export.
 * Delay: 10ms per frame (GIF minimum). Loops indefinitely.
 */
export async function exportGIF(
  { featureImage, textColor, frameColor }: Omit<RenderParams, 'canvas'>,
  issueNumber: string,
): Promise<void> {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');

  const gif = GIFEncoder();
  const offCanvas = document.createElement('canvas');
  offCanvas.width = CANVAS_W;
  offCanvas.height = CANVAS_H;

  for (let i = 0; i < ANIMATION_SEQUENCE.length; i++) {
    const variant = ANIMATION_SEQUENCE[i];
    renderFrameVariant({ canvas: offCanvas, featureImage, textColor, frameColor, variant });

    const ctx = offCanvas.getContext('2d')!;
    const { data } = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);

    gif.writeFrame(index, CANVAS_W, CANVAS_H, {
      palette,
      delay: 10,
      // Set repeat=0 (loop forever) via the first frame's options
      ...(i === 0 && { repeat: 0 }),
    });
  }

  gif.finish();
  const bytes = gif.bytes();
  const blob = new Blob([bytes], { type: 'image/gif' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `TheFridayMixer-${issueNumber}.gif`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
