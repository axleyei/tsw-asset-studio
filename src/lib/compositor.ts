// Canvas output dimensions (px)
export const CANVAS_W = 1456;
export const CANVAS_H = 950;

// Feature image placement
export const FEATURE_SIZE = 950;
export const FEATURE_X = 484;
export const FEATURE_Y = 0;

// Asset URLs — files must be placed in public/assets/
const ASSET_PATHS = {
  frame:       '/assets/frame_A_neutral.png',
  textFill:    '/assets/text_fill_neutral.png',
  textOutline: '/assets/text_outline_white.png',
  logo:        '/assets/so_logo_white.png',
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
 * Renders one frame onto `canvas` following the spec compositing order:
 *   1. Feature image at (484, 0) → 950×950
 *   2. Tinted frame overlay (preserves grain)
 *   3. Tinted text fill (solid color)
 *   4. White text outline (as-is)
 *   5. White logo (as-is)
 */
export function renderFrame({
  canvas,
  featureImage,
  textColor,
  frameColor,
}: RenderParams): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // 1. Feature image
  if (featureImage) {
    ctx.drawImage(featureImage, FEATURE_X, FEATURE_Y, FEATURE_SIZE, FEATURE_SIZE);
  }

  // 2. Frame overlay — tinted, luminance-preserving
  const frame = getAsset('frame');
  if (frame) {
    ctx.drawImage(tintAsset(frame, frameColor, CANVAS_W, CANVAS_H, true), 0, 0);
  }

  // 3. Text fill — tinted, solid color
  const textFill = getAsset('textFill');
  if (textFill) {
    ctx.drawImage(tintAsset(textFill, textColor, CANVAS_W, CANVAS_H, false), 0, 0);
  }

  // 4. Text outline — white, drawn as-is
  const textOutline = getAsset('textOutline');
  if (textOutline) {
    ctx.drawImage(textOutline, 0, 0);
  }

  // 5. Logo — white, drawn as-is
  const logo = getAsset('logo');
  if (logo) {
    ctx.drawImage(logo, 0, 0);
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function exportPNG(canvas: HTMLCanvasElement, issueNumber: string): void {
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
