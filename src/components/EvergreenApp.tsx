'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { BASE_COLORS } from '@/lib/colors';

// ─── Canvas dimensions ────────────────────────────────────────────────────────

const THUMB_W = 1456;
const THUMB_H = 1048;
const STORY_W = 1080;
const STORY_H = 1920;

// IG Story preview max-width (portrait — cap so it doesn't overwhelm the column)
const STORY_PREVIEW_MAX_W = 360;

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 'evergreen' | 'friday-mixer';

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Returns today's date as YYYY-MM-DD using local time. */
function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Converts YYYY-MM-DD → MM/DD/YYYY for display. */
function formatDateDisplay(iso: string): string {
  const [yyyy, mm, dd] = iso.split('-');
  return `${mm}/${dd}/${yyyy}`;
}

/** Converts YYYY-MM-DD → YYYYMMDD for filenames. */
function formatDateFilename(iso: string): string {
  return iso.replace(/-/g, '');
}

// ─── Image helpers ────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Draws an image onto the canvas using cover scaling, then applies zoom and
 * X/Y pan offsets.
 *
 * @param zoom  Multiplier applied on top of cover scale. 1.0 = base cover.
 * @param xPct  0–100. 50 = centered. 0 = show left edge, 100 = show right edge.
 * @param yPct  0–100. 50 = centered. 0 = show top edge, 100 = show bottom edge.
 */
function drawImageCoverWithTransform(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  canvasW: number,
  canvasH: number,
  zoom: number,
  xPct: number,
  yPct: number,
) {
  const baseScale = Math.max(canvasW / img.naturalWidth, canvasH / img.naturalHeight);
  const scale = baseScale * zoom;
  const drawW = img.naturalWidth * scale;
  const drawH = img.naturalHeight * scale;

  // Overflow is how many pixels of image extend beyond the canvas in each axis.
  // Pan offsets are derived from xPct/yPct within that overflow range.
  const overflowX = Math.max(0, drawW - canvasW);
  const overflowY = Math.max(0, drawH - canvasH);

  const x = -(xPct / 100) * overflowX;
  const y = -(yPct / 100) * overflowY;

  ctx.drawImage(img, x, y, drawW, drawH);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (!text.trim()) return [];
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Returns an offscreen canvas with the given image tinted to a solid color.
 * The image's alpha channel is preserved (destination-in clips the fill to
 * the image's own shape), producing a flat solid-color silhouette — the same
 * technique used by the original Friday Mixer compositor for text layers.
 */
function tintImage(
  img: HTMLImageElement,
  color: string,
  w: number,
  h: number,
): HTMLCanvasElement {
  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  const ctx = offscreen.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(img, 0, 0, w, h);
  return offscreen;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-800 rounded-xl p-5 space-y-3">
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
        {title}
      </h2>
      {children}
    </div>
  );
}

/** Generic labeled range slider. Pass a pre-formatted displayValue string. */
function Slider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  displayValue,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  displayValue: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <label className="text-sm text-slate-400">{label}</label>
        <span className="text-xs text-slate-500 font-mono tabular-nums">{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer accent-blue-400 h-1.5"
      />
    </div>
  );
}

/** Collapsible disclosure section used inside a SectionCard for optional controls. */
function CollapsibleSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full py-0.5 group"
      >
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide group-hover:text-slate-200 transition-colors">
          {label}
        </span>
        <span
          className={[
            'text-slate-500 group-hover:text-slate-300 transition-transform duration-150 text-xs leading-none',
            open ? 'rotate-180' : '',
          ].join(' ')}
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 pt-3 border-t border-slate-700/50">
          {children}
        </div>
      )}
    </div>
  );
}

/** Segmented mode toggle shown at the top of the left column. */
function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const options: { key: Mode; label: string }[] = [
    { key: 'evergreen',    label: 'Evergreen' },
    { key: 'friday-mixer', label: 'The Friday Mixer' },
  ];

  return (
    <div className="flex gap-1 p-1 rounded-xl bg-slate-900 border border-slate-700/60">
      {options.map(({ key, label }) => {
        const active = mode === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={[
              'flex-1 py-2 px-2 rounded-lg text-xs font-semibold tracking-tight transition-all duration-150',
              active
                ? 'bg-white text-slate-900 shadow-md shadow-black/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60',
            ].join(' ')}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Asset types ──────────────────────────────────────────────────────────────

interface Assets {
  grainThumbnail: HTMLImageElement;
  grainStory: HTMLImageElement;
  logoThumbnail: HTMLImageElement;
  logoStory: HTMLImageElement;
  tfmTextFill: HTMLImageElement;
  tfmTextOutline: HTMLImageElement;
}

// ─── Positioning defaults ────────────────────────────────────────────────────

const DEFAULT_ZOOM = 1.0;
const DEFAULT_X    = 50;
const DEFAULT_Y    = 50;

// ─── Main component ───────────────────────────────────────────────────────────

export default function EvergreenApp() {
  // Mode
  const [mode, setMode] = useState<Mode>('evergreen');

  // Date — lazy-initialized to today so the input is never blank on first render
  const [issueDate, setIssueDate] = useState<string>(() => todayISO());

  // Shared image (populates both canvases by default)
  const [sharedImage, setSharedImage] = useState<HTMLImageElement | null>(null);
  const [sharedImageUrl, setSharedImageUrl] = useState<string | null>(null);
  const [sharedImageInfo, setSharedImageInfo] = useState<{ w: number; h: number } | null>(null);
  const [sharedImageError, setSharedImageError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Per-canvas image overrides (thumbnail override used in Evergreen mode only)
  const [thumbOverride, setThumbOverride] = useState<HTMLImageElement | null>(null);
  const [thumbOverrideUrl, setThumbOverrideUrl] = useState<string | null>(null);
  const [storyOverride, setStoryOverride] = useState<HTMLImageElement | null>(null);
  const [storyOverrideUrl, setStoryOverrideUrl] = useState<string | null>(null);

  // Thumbnail opacity controls
  const [thumbGrainOpacity, setThumbGrainOpacity] = useState(100);
  const [thumbVeilOpacity, setThumbVeilOpacity] = useState(65);

  // Thumbnail positioning
  const [thumbZoom, setThumbZoom] = useState(DEFAULT_ZOOM);
  const [thumbX, setThumbX]       = useState(DEFAULT_X);
  const [thumbY, setThumbY]       = useState(DEFAULT_Y);

  // Friday Mixer–specific controls
  const [tfmVeilOpacity, setTfmVeilOpacity] = useState(65);
  const [tfmTextColor, setTfmTextColor]     = useState('');

  // IG Story opacity controls
  const [storyGrainOpacity, setStoryGrainOpacity] = useState(100);
  const [storyVeilOpacity, setStoryVeilOpacity]   = useState(60);
  const [headline, setHeadline]     = useState('');
  const [authorName, setAuthorName] = useState('');
  const [authorTitle, setAuthorTitle] = useState('');

  // IG Story positioning
  const [storyZoom, setStoryZoom] = useState(DEFAULT_ZOOM);
  const [storyX, setStoryX]       = useState(DEFAULT_X);
  const [storyY, setStoryY]       = useState(DEFAULT_Y);

  // Fonts & assets
  const [fontsLoaded, setFontsLoaded]   = useState(false);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [assetsError, setAssetsError]   = useState(false);
  const assetsRef = useRef<Assets | null>(null);

  // FPO placeholder (shown in canvas previews only; never exported, never shown in panel)
  const [fpoImage, setFpoImage] = useState<HTMLImageElement | null>(null);

  // Export state
  const [isExportingThumb, setIsExportingThumb] = useState(false);
  const [isExportingStory, setIsExportingStory] = useState(false);

  // Refs
  const thumbCanvasRef  = useRef<HTMLCanvasElement>(null);
  const storyCanvasRef  = useRef<HTMLCanvasElement>(null);
  const sharedFileRef   = useRef<HTMLInputElement>(null);
  const thumbFileRef    = useRef<HTMLInputElement>(null);
  const storyFileRef    = useRef<HTMLInputElement>(null);
  const prevSharedUrlRef = useRef<string | null>(null);
  const prevThumbUrlRef  = useRef<string | null>(null);
  const prevStoryUrlRef  = useRef<string | null>(null);

  // ─── Derived state ──────────────────────────────────────────────────────────

  const dateValid = issueDate.trim() !== '';
  const dateStr   = dateValid ? formatDateFilename(issueDate) : '';

  const effectiveThumbImage = thumbOverride ?? sharedImage;
  const effectiveStoryImage = storyOverride ?? sharedImage;

  const canExportThumb = !!effectiveThumbImage && dateValid;
  const canExportStory =
    !!effectiveStoryImage &&
    dateValid &&
    headline.trim() !== '' &&
    authorName.trim() !== '' &&
    authorTitle.trim() !== '';

  const thumbExportFilename =
    mode === 'friday-mixer'
      ? `TheFridayMixer-Thumbnail-${dateStr}.png`
      : `TheSoWhat-Thumbnail-${dateStr}.png`;

  const storyExportFilename = `TheSoWhat-IGStory-${dateStr}.png`;

  // ─── Randomise TFM text color whenever Friday Mixer mode is entered ──────────
  //     Runs on mount (mode='evergreen' initially, so no randomise) and each time
  //     mode flips to 'friday-mixer'.

  useEffect(() => {
    if (mode === 'friday-mixer') {
      const random = BASE_COLORS[Math.floor(Math.random() * BASE_COLORS.length)];
      setTfmTextColor(random.value);
    }
  }, [mode]);

  // ─── Load FPO placeholder image ──────────────────────────────────────────────

  useEffect(() => {
    loadImage('/assets/test_pattern.png')
      .then((img) => setFpoImage(img))
      .catch(() => {}); // silent — previews just fall back to dark background
  }, []);

  // ─── Load custom fonts via FontFace API ─────────────────────────────────────

  useEffect(() => {
    const editorial = new FontFace(
      'EditorialNew',
      "url('/fonts/PPEditorialNew-Light.woff2')",
      { weight: '300', style: 'normal' },
    );
    const powerGrotesk = new FontFace(
      'PowerGrotesk',
      "url('/fonts/PowerGrotesk-Medium.woff2')",
      { weight: '500', style: 'normal' },
    );
    Promise.all([editorial.load(), powerGrotesk.load()])
      .then(([ef, pf]) => {
        document.fonts.add(ef);
        document.fonts.add(pf);
        setFontsLoaded(true);
      })
      .catch(() => {
        setFontsLoaded(true);
      });
  }, []);

  // ─── Load static overlay assets ─────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      loadImage('/assets/grain_thumbnail.png'),
      loadImage('/assets/grain_story.png'),
      loadImage('/assets/so_logo_thumbnail.png'),
      loadImage('/assets/logo_story.png'),
      loadImage('/assets/tfm_text_fill.png'),
      loadImage('/assets/tfm_text_outline.png'),
    ])
      .then(([grainThumbnail, grainStory, logoThumbnail, logoStory, tfmTextFill, tfmTextOutline]) => {
        assetsRef.current = { grainThumbnail, grainStory, logoThumbnail, logoStory, tfmTextFill, tfmTextOutline };
        setAssetsLoaded(true);
      })
      .catch(() => setAssetsError(true));
  }, []);

  // ─── Thumbnail canvas render ─────────────────────────────────────────────────

  useEffect(() => {
    const canvas = thumbCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, THUMB_W, THUMB_H);

    // 1. Feature image (fill/center cover with transform), FPO placeholder, or
    //    dark background. FPO is purely visual — it cannot satisfy canExportThumb
    //    and will never appear in a downloaded file.
    if (effectiveThumbImage) {
      drawImageCoverWithTransform(ctx, effectiveThumbImage, THUMB_W, THUMB_H, thumbZoom, thumbX, thumbY);
    } else if (fpoImage) {
      drawImageCoverWithTransform(ctx, fpoImage, THUMB_W, THUMB_H, thumbZoom, thumbX, thumbY);
    } else {
      ctx.fillStyle = '#0f0f0f';
      ctx.fillRect(0, 0, THUMB_W, THUMB_H);
    }

    const assets = assetsRef.current;

    if (mode === 'friday-mixer') {
      // ── Friday Mixer layer order ──────────────────────────────────────────
      // 2. Left-side TFM veil: mirrored diagonal gradient,
      //    transparent at (971, 262) → black at (0, 1048)
      if (tfmVeilOpacity > 0) {
        ctx.save();
        ctx.globalAlpha = tfmVeilOpacity / 100;
        const tfmGrad = ctx.createLinearGradient(971, 262, 0, THUMB_H);
        tfmGrad.addColorStop(0, 'rgba(0,0,0,0)');
        tfmGrad.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.fillStyle = tfmGrad;
        ctx.fillRect(0, 0, THUMB_W, THUMB_H);
        ctx.restore();
      }

      // 3. Right-side "So" veil: same diagonal gradient as Evergreen thumbnail
      if (thumbVeilOpacity > 0) {
        ctx.save();
        ctx.globalAlpha = thumbVeilOpacity / 100;
        const soGrad = ctx.createLinearGradient(485, 262, THUMB_W, THUMB_H);
        soGrad.addColorStop(0, 'rgba(0,0,0,0)');
        soGrad.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.fillStyle = soGrad;
        ctx.fillRect(0, 0, THUMB_W, THUMB_H);
        ctx.restore();
      }

      // 4. Grain overlay (multiply blend)
      if (assetsLoaded && assets?.grainThumbnail && thumbGrainOpacity > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = thumbGrainOpacity / 100;
        ctx.drawImage(assets.grainThumbnail, 0, 0, THUMB_W, THUMB_H);
        ctx.restore();
      }

      // 5. TFM text fill — tinted to the selected color
      if (assetsLoaded && assets?.tfmTextFill && tfmTextColor) {
        const tinted = tintImage(assets.tfmTextFill, tfmTextColor, THUMB_W, THUMB_H);
        ctx.drawImage(tinted, 0, 0);
      }

      // 6. TFM text outline — white, drawn as-is
      if (assetsLoaded && assets?.tfmTextOutline) {
        ctx.drawImage(assets.tfmTextOutline, 0, 0, THUMB_W, THUMB_H);
      }

      // 7. So logo overlay
      if (assetsLoaded && assets?.logoThumbnail) {
        ctx.drawImage(assets.logoThumbnail, 0, 0, THUMB_W, THUMB_H);
      }
    } else {
      // ── Evergreen layer order ─────────────────────────────────────────────
      // 2. Grain overlay — Multiply blend makes the solid PNG background
      //    transparent; only the dark grain texture darkens the image beneath.
      if (assetsLoaded && assets?.grainThumbnail && thumbGrainOpacity > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = thumbGrainOpacity / 100;
        ctx.drawImage(assets.grainThumbnail, 0, 0, THUMB_W, THUMB_H);
        ctx.restore();
      }

      // 3. Veil: diagonal linear gradient, transparent at (485,262) → black at (1456,1048)
      if (thumbVeilOpacity > 0) {
        ctx.save();
        ctx.globalAlpha = thumbVeilOpacity / 100;
        const grad = ctx.createLinearGradient(485, 262, THUMB_W, THUMB_H);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, THUMB_W, THUMB_H);
        ctx.restore();
      }

      // 4. Logo overlay
      if (assetsLoaded && assets?.logoThumbnail) {
        ctx.drawImage(assets.logoThumbnail, 0, 0, THUMB_W, THUMB_H);
      }
    }
  }, [
    effectiveThumbImage,
    fpoImage,
    thumbGrainOpacity,
    thumbVeilOpacity,
    thumbZoom,
    thumbX,
    thumbY,
    assetsLoaded,
    mode,
    tfmVeilOpacity,
    tfmTextColor,
  ]);

  // ─── IG Story canvas render ──────────────────────────────────────────────────
  //     `mode` is included in deps so the effect re-fires when the story canvas
  //     remounts after switching back from Friday Mixer mode.

  useEffect(() => {
    const canvas = storyCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, STORY_W, STORY_H);

    // 1. Feature image (fill/center cover with transform), FPO placeholder, or
    //    dark background. FPO is purely visual — it cannot satisfy canExportStory
    //    and will never appear in a downloaded file.
    if (effectiveStoryImage) {
      drawImageCoverWithTransform(ctx, effectiveStoryImage, STORY_W, STORY_H, storyZoom, storyX, storyY);
    } else if (fpoImage) {
      drawImageCoverWithTransform(ctx, fpoImage, STORY_W, STORY_H, storyZoom, storyX, storyY);
    } else {
      ctx.fillStyle = '#0f0f0f';
      ctx.fillRect(0, 0, STORY_W, STORY_H);
    }

    // 2. Grain overlay — Multiply blend makes the solid PNG background transparent;
    //    only the dark grain texture darkens the image beneath.
    const assets = assetsRef.current;
    if (assetsLoaded && assets?.grainStory && storyGrainOpacity > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = storyGrainOpacity / 100;
      ctx.drawImage(assets.grainStory, 0, 0, STORY_W, STORY_H);
      ctx.restore();
    }

    // 3. Veil: solid flat black rectangle
    if (storyVeilOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = storyVeilOpacity / 100;
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, STORY_W, STORY_H);
      ctx.restore();
    }

    // 4. Logo + vertical line overlay (always static)
    if (assetsLoaded && assets?.logoStory) {
      ctx.drawImage(assets.logoStory, 0, 0, STORY_W, STORY_H);
    }

    // 5. Text elements — wait for fonts to be fully loaded
    if (fontsLoaded) {
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      const cx = STORY_W / 2;
      const headlineMaxWidth = STORY_W - 120; // 60px padding each side

      // Headline: EditorialNew 300, 164px, top of text block at y=610, line height 170px
      // Manual line-break support: press Enter or type literal \n.
      ctx.textBaseline = 'top';
      ctx.font = '300 164px EditorialNew';
      const headlineLines: string[] = headline.length > 0
        ? headline
            .replace(/\\n/g, '\n')
            .split('\n')
            .flatMap((segment) =>
              segment.length > 0
                ? wrapText(ctx, segment, headlineMaxWidth)
                : [''],
            )
        : [];
      const HEADLINE_TOP_Y  = 610;
      const HEADLINE_LINE_H = 170;
      const HEADLINE_FONT_SIZE = 164;
      headlineLines.forEach((line, i) => {
        ctx.fillText(line, cx, HEADLINE_TOP_Y + i * HEADLINE_LINE_H);
      });

      const lastLineTopY = HEADLINE_TOP_Y + Math.max(0, headlineLines.length - 1) * HEADLINE_LINE_H;
      const lastHeadlineBaseline = lastLineTopY + Math.round(HEADLINE_FONT_SIZE * 0.8);

      ctx.textBaseline = 'alphabetic';

      // Author name
      const authorBaseline = lastHeadlineBaseline + 200;
      ctx.font = '300 67px EditorialNew';
      if (authorName.trim()) ctx.fillText(authorName.trim(), cx, authorBaseline);

      // Author title
      const titleBaseline = authorBaseline + 60;
      ctx.font = '500 36px PowerGrotesk';
      if (authorTitle.trim()) ctx.fillText(authorTitle.trim().toUpperCase(), cx, titleBaseline);

      // Link sticker placeholder
      const linkBaseline = titleBaseline + 140;
      ctx.font = '300 47px EditorialNew';
      ctx.fillText('LINK STICKER HERE', cx, linkBaseline);
    }
  }, [
    effectiveStoryImage,
    fpoImage,
    storyGrainOpacity,
    storyVeilOpacity,
    storyZoom,
    storyX,
    storyY,
    headline,
    authorName,
    authorTitle,
    assetsLoaded,
    fontsLoaded,
    mode, // ensures repaint when canvas remounts after mode switch
  ]);

  // ─── Mode change ─────────────────────────────────────────────────────────────
  //     Clears all image state and resets positioning so each mode starts fresh.

  const handleModeChange = useCallback((newMode: Mode) => {
    // Revoke all object URLs
    if (prevSharedUrlRef.current) { URL.revokeObjectURL(prevSharedUrlRef.current); prevSharedUrlRef.current = null; }
    if (prevThumbUrlRef.current)  { URL.revokeObjectURL(prevThumbUrlRef.current);  prevThumbUrlRef.current  = null; }
    if (prevStoryUrlRef.current)  { URL.revokeObjectURL(prevStoryUrlRef.current);  prevStoryUrlRef.current  = null; }

    // Clear image state
    setSharedImage(null);
    setSharedImageUrl(null);
    setSharedImageInfo(null);
    setSharedImageError(null);
    setThumbOverride(null);
    setThumbOverrideUrl(null);
    setStoryOverride(null);
    setStoryOverrideUrl(null);

    // Reset positioning for both canvases
    setThumbZoom(DEFAULT_ZOOM); setThumbX(DEFAULT_X); setThumbY(DEFAULT_Y);
    setStoryZoom(DEFAULT_ZOOM); setStoryX(DEFAULT_X); setStoryY(DEFAULT_Y);

    setMode(newMode);
  }, []);

  // ─── Image file processing ───────────────────────────────────────────────────

  const processImageFile = useCallback(
    async (file: File, target: 'shared' | 'thumbnail' | 'story') => {
      if (!file.type.match(/^image\/(png|jpe?g)$/)) {
        if (target === 'shared') setSharedImageError('Please upload a PNG or JPG image.');
        return;
      }

      const url = URL.createObjectURL(file);
      try {
        const img = await loadImage(url);

        if (target === 'shared') {
          if (prevSharedUrlRef.current) URL.revokeObjectURL(prevSharedUrlRef.current);
          if (prevThumbUrlRef.current)  URL.revokeObjectURL(prevThumbUrlRef.current);
          if (prevStoryUrlRef.current)  URL.revokeObjectURL(prevStoryUrlRef.current);
          prevSharedUrlRef.current = url;
          prevThumbUrlRef.current  = null;
          prevStoryUrlRef.current  = null;
          setThumbOverride(null);   setThumbOverrideUrl(null);
          setStoryOverride(null);   setStoryOverrideUrl(null);
          setSharedImage(img);
          setSharedImageUrl(url);
          setSharedImageInfo({ w: img.naturalWidth, h: img.naturalHeight });
          setSharedImageError(null);
          // Reset positioning for both canvases when a new shared image is loaded
          setThumbZoom(DEFAULT_ZOOM); setThumbX(DEFAULT_X); setThumbY(DEFAULT_Y);
          setStoryZoom(DEFAULT_ZOOM); setStoryX(DEFAULT_X); setStoryY(DEFAULT_Y);
        } else if (target === 'thumbnail') {
          if (prevThumbUrlRef.current) URL.revokeObjectURL(prevThumbUrlRef.current);
          prevThumbUrlRef.current = url;
          setThumbOverride(img);
          setThumbOverrideUrl(url);
          // Reset thumbnail positioning for the new image
          setThumbZoom(DEFAULT_ZOOM); setThumbX(DEFAULT_X); setThumbY(DEFAULT_Y);
        } else {
          if (prevStoryUrlRef.current) URL.revokeObjectURL(prevStoryUrlRef.current);
          prevStoryUrlRef.current = url;
          setStoryOverride(img);
          setStoryOverrideUrl(url);
          // Reset story positioning for the new image
          setStoryZoom(DEFAULT_ZOOM); setStoryX(DEFAULT_X); setStoryY(DEFAULT_Y);
        }
      } catch {
        URL.revokeObjectURL(url);
        if (target === 'shared') setSharedImageError('Failed to load image. Please try another file.');
      }
    },
    [],
  );

  // ─── Export handlers ─────────────────────────────────────────────────────────

  const handleExportThumb = useCallback(() => {
    if (!canExportThumb || isExportingThumb) return;
    const canvas = thumbCanvasRef.current;
    if (!canvas) return;
    setIsExportingThumb(true);
    canvas.toBlob((blob) => {
      if (!blob) { setIsExportingThumb(false); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = thumbExportFilename;
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); setIsExportingThumb(false); }, 500);
    }, 'image/png');
  }, [canExportThumb, isExportingThumb, thumbExportFilename]);

  const handleExportStory = useCallback(() => {
    if (!canExportStory || isExportingStory) return;
    const canvas = storyCanvasRef.current;
    if (!canvas) return;
    setIsExportingStory(true);
    canvas.toBlob((blob) => {
      if (!blob) { setIsExportingStory(false); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = storyExportFilename;
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); setIsExportingStory(false); }, 500);
    }, 'image/png');
  }, [canExportStory, isExportingStory, storyExportFilename]);

  // ─── Override clear helpers ───────────────────────────────────────────────────

  const clearThumbOverride = useCallback(() => {
    if (prevThumbUrlRef.current) URL.revokeObjectURL(prevThumbUrlRef.current);
    prevThumbUrlRef.current = null;
    setThumbOverride(null);
    setThumbOverrideUrl(null);
  }, []);

  const clearStoryOverride = useCallback(() => {
    if (prevStoryUrlRef.current) URL.revokeObjectURL(prevStoryUrlRef.current);
    prevStoryUrlRef.current = null;
    setStoryOverride(null);
    setStoryOverrideUrl(null);
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <main className="flex gap-6 p-6 flex-1 min-h-0">

        {/* ── Left column: Controls ──────────────────────────────────────── */}
        <div className="w-72 shrink-0 flex flex-col gap-4 overflow-y-auto pb-4">

          {/* Mode toggle */}
          <ModeToggle mode={mode} onChange={handleModeChange} />

          {/* Date */}
          <SectionCard title="Date">
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className={[
                'w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white',
                'focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors',
                '[&::-webkit-calendar-picker-indicator]:invert',
                '[&::-webkit-calendar-picker-indicator]:opacity-60',
                '[&::-webkit-calendar-picker-indicator]:cursor-pointer',
                '[&::-webkit-calendar-picker-indicator]:hover:opacity-100',
              ].join(' ')}
            />
            {dateValid && (
              <p className="text-xs text-slate-500 font-mono">
                {formatDateDisplay(issueDate)}
              </p>
            )}
          </SectionCard>

          {/* Shared feature image upload */}
          <SectionCard title="Feature Image">
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload feature image"
              className={[
                'border-2 border-dashed rounded-lg cursor-pointer transition-all',
                'focus:outline-none focus:ring-2 focus:ring-blue-500/40',
                isDragging
                  ? 'border-blue-400 bg-blue-500/10'
                  : sharedImageError
                  ? 'border-red-500/50 bg-red-500/5 hover:border-red-400/60'
                  : sharedImage
                  ? 'border-green-500/40 bg-green-500/5 hover:border-green-400/60'
                  : 'border-slate-600 hover:border-slate-400',
              ].join(' ')}
              onClick={() => sharedFileRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  sharedFileRef.current?.click();
                }
              }}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) processImageFile(file, 'shared');
              }}
            >
              <input
                ref={sharedFileRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) processImageFile(file, 'shared');
                  e.target.value = '';
                }}
              />

              {sharedImageUrl && sharedImage ? (
                <div className="p-3 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={sharedImageUrl}
                    alt="Feature image thumbnail"
                    className="w-14 h-14 object-cover rounded shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-green-400 font-medium">Image loaded</p>
                    {sharedImageInfo && (
                      <p className="text-xs text-slate-400 mt-0.5 font-mono">
                        {sharedImageInfo.w}×{sharedImageInfo.h}
                      </p>
                    )}
                    <p className="text-xs text-slate-500 mt-1">Click to replace</p>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-6 text-center">
                  <div className="text-2xl mb-2 text-slate-500">↑</div>
                  <p className="text-sm text-slate-300 font-medium">Upload feature image</p>
                  <p className="text-xs text-slate-500 mt-1">PNG or JPG</p>
                  <p className="text-xs text-slate-600 mt-1">Click or drag &amp; drop</p>
                </div>
              )}
            </div>

            {sharedImageError && (
              <p className="text-xs text-red-400 leading-relaxed">{sharedImageError}</p>
            )}
          </SectionCard>

          {/* ── Thumbnail controls ──────────────────────────────────────────── */}
          <SectionCard title="Thumbnail (1456 × 1048)">

            {/* Per-canvas image override — Evergreen mode only */}
            {mode === 'evergreen' && (
              <div className="flex items-center gap-2 flex-wrap">
                {thumbOverrideUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbOverrideUrl}
                    alt="Thumbnail image override"
                    className="w-8 h-8 object-cover rounded shrink-0"
                  />
                )}
                <button
                  onClick={() => thumbFileRef.current?.click()}
                  className="text-xs text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 rounded-md px-3 py-1.5 transition-colors"
                >
                  Change image
                </button>
                {thumbOverride && (
                  <button
                    onClick={clearThumbOverride}
                    aria-label="Clear thumbnail image override"
                    className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                  >
                    Reset
                  </button>
                )}
              </div>
            )}
            <input
              ref={thumbFileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) processImageFile(file, 'thumbnail');
                e.target.value = '';
              }}
            />

            <Slider
              label="Grain opacity"
              value={thumbGrainOpacity}
              displayValue={`${thumbGrainOpacity}%`}
              onChange={setThumbGrainOpacity}
            />
            <Slider
              label={mode === 'friday-mixer' ? '"So" Veil opacity' : 'Veil opacity'}
              value={thumbVeilOpacity}
              displayValue={`${thumbVeilOpacity}%`}
              onChange={setThumbVeilOpacity}
            />

            {/* TFM-only controls */}
            {mode === 'friday-mixer' && (
              <>
                <Slider
                  label='"TFM" Veil opacity'
                  value={tfmVeilOpacity}
                  displayValue={`${tfmVeilOpacity}%`}
                  onChange={setTfmVeilOpacity}
                />

                {/* Text color dropdown */}
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">
                    Text color
                  </label>
                  <div className="relative">
                    <span
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-slate-500 pointer-events-none"
                      style={{ backgroundColor: tfmTextColor || 'transparent' }}
                    />
                    <select
                      value={tfmTextColor}
                      onChange={(e) => setTfmTextColor(e.target.value)}
                      className="w-full appearance-none bg-slate-700 border border-slate-600 rounded-lg pl-8 pr-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors"
                    >
                      {BASE_COLORS.map((color) => (
                        <option key={color.id} value={color.value}>
                          {color.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* Image positioning — only available once an image is loaded */}
            {effectiveThumbImage && (
              <CollapsibleSection key={mode} label="Adjust Image Positioning">
                <Slider
                  label="Zoom"
                  value={thumbZoom}
                  min={1}
                  max={2}
                  step={0.05}
                  displayValue={`${thumbZoom.toFixed(1)}×`}
                  onChange={setThumbZoom}
                />
                <Slider
                  label="X Position"
                  value={thumbX}
                  displayValue={`${thumbX}%`}
                  onChange={setThumbX}
                />
                <Slider
                  label="Y Position"
                  value={thumbY}
                  displayValue={`${thumbY}%`}
                  onChange={setThumbY}
                />
              </CollapsibleSection>
            )}

            <button
              onClick={handleExportThumb}
              disabled={!canExportThumb || isExportingThumb}
              className={[
                'w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all',
                canExportThumb && !isExportingThumb
                  ? 'bg-white text-slate-900 hover:bg-slate-100 active:scale-[0.98] shadow-lg shadow-white/10'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed',
              ].join(' ')}
            >
              {isExportingThumb ? 'Exporting…' : 'Download Thumbnail PNG'}
            </button>

            {!canExportThumb ? (
              <p className="text-xs text-slate-600 text-center leading-relaxed">
                {!dateValid && !effectiveThumbImage
                  ? 'Select a date and upload an image.'
                  : !dateValid
                  ? 'Select a date.'
                  : 'Upload an image to continue.'}
              </p>
            ) : (
              <p className="text-xs text-slate-500 text-center font-mono truncate">
                {thumbExportFilename}
              </p>
            )}
          </SectionCard>

          {/* ── IG Story controls — Evergreen mode only ─────────────────────── */}
          {mode === 'evergreen' && (
            <SectionCard title="IG Story (1080 × 1920)">
              {/* Per-canvas image override */}
              <div className="flex items-center gap-2 flex-wrap">
                {storyOverrideUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={storyOverrideUrl}
                    alt="Story image override"
                    className="w-8 h-8 object-cover rounded shrink-0"
                  />
                )}
                <button
                  onClick={() => storyFileRef.current?.click()}
                  className="text-xs text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 rounded-md px-3 py-1.5 transition-colors"
                >
                  Change image
                </button>
                {storyOverride && (
                  <button
                    onClick={clearStoryOverride}
                    aria-label="Clear story image override"
                    className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                  >
                    Reset
                  </button>
                )}
              </div>
              <input
                ref={storyFileRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) processImageFile(file, 'story');
                  e.target.value = '';
                }}
              />

              {/* Text inputs */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Headline</label>
                <textarea
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="Article headline…"
                  rows={3}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors resize-none text-sm leading-relaxed"
                />
                <p className="text-xs text-slate-600 mt-1.5">
                  Tip: Type &lsquo;\n&rsquo; for a manual line break.
                </p>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Author Name</label>
                <input
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Uncle Arty"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors text-sm"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Author Title</label>
                <input
                  type="text"
                  value={authorTitle}
                  onChange={(e) => setAuthorTitle(e.target.value)}
                  placeholder="Senior VP of Keeping it Real"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors text-sm"
                />
              </div>

              <Slider
                label="Grain opacity"
                value={storyGrainOpacity}
                displayValue={`${storyGrainOpacity}%`}
                onChange={setStoryGrainOpacity}
              />
              <Slider
                label="Veil opacity"
                value={storyVeilOpacity}
                displayValue={`${storyVeilOpacity}%`}
                onChange={setStoryVeilOpacity}
              />

              {/* Image positioning — only available once an image is loaded */}
              {effectiveStoryImage && (
                <CollapsibleSection label="Adjust Image Positioning">
                  <Slider
                    label="Zoom"
                    value={storyZoom}
                    min={1}
                    max={2}
                    step={0.05}
                    displayValue={`${storyZoom.toFixed(1)}×`}
                    onChange={setStoryZoom}
                  />
                  <Slider
                    label="X Position"
                    value={storyX}
                    displayValue={`${storyX}%`}
                    onChange={setStoryX}
                  />
                  <Slider
                    label="Y Position"
                    value={storyY}
                    displayValue={`${storyY}%`}
                    onChange={setStoryY}
                  />
                </CollapsibleSection>
              )}

              <button
                onClick={handleExportStory}
                disabled={!canExportStory || isExportingStory}
                className={[
                  'w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all',
                  canExportStory && !isExportingStory
                    ? 'bg-white text-slate-900 hover:bg-slate-100 active:scale-[0.98] shadow-lg shadow-white/10'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed',
                ].join(' ')}
              >
                {isExportingStory ? 'Exporting…' : 'Download IG Story PNG'}
              </button>

              {!canExportStory ? (
                <p className="text-xs text-slate-600 text-center leading-relaxed">
                  {!dateValid && !effectiveStoryImage
                    ? 'Select a date and upload an image.'
                    : !dateValid
                    ? 'Select a date.'
                    : !effectiveStoryImage
                    ? 'Upload an image to continue.'
                    : 'Fill in headline, author name, and author title.'}
                </p>
              ) : (
                <p className="text-xs text-slate-500 text-center font-mono truncate">
                  {storyExportFilename}
                </p>
              )}
            </SectionCard>
          )}
        </div>

        {/* ── Right column: Previews ─────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto pb-6">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4 shrink-0">
            Preview
          </h2>

          {/*
            Layout strategy: both previews share the same fixed CSS height (440px)
            so widths flow naturally from each canvas's aspect ratio:
              Thumbnail  1456×1048 → ~612px wide at 440px tall
              IG Story   1080×1920 → ~248px wide at 440px tall
            In Friday Mixer mode the IG Story canvas is hidden.
          */}
          <div className="flex flex-col xl:flex-row xl:items-start gap-5">

            {/* Thumbnail */}
            <div className="flex flex-col gap-2 w-full xl:w-auto shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Thumbnail</span>
                <span className="text-xs text-slate-600 font-mono">
                  {THUMB_W} × {THUMB_H}
                </span>
              </div>
              <div
                className="relative w-full xl:w-auto xl:h-[clamp(440px,_calc(-160px_+_46.875vw),_560px)] rounded-xl overflow-hidden bg-slate-950 shadow-2xl shadow-black/50 ring-1 ring-slate-700/50"
                style={{ aspectRatio: `${THUMB_W}/${THUMB_H}`, maxWidth: 1000 }}
              >
                <canvas
                  ref={thumbCanvasRef}
                  width={THUMB_W}
                  height={THUMB_H}
                  className="absolute inset-0 w-full h-full"
                />
              </div>
            </div>

            {/* IG Story — Evergreen mode only */}
            {mode === 'evergreen' && (
              <>
                <div className="xl:hidden border-t border-slate-700/50 w-full shrink-0" />
                <div className="hidden xl:block w-px self-stretch bg-slate-700/50 shrink-0" />

                <div className="flex flex-col gap-2 w-full xl:w-auto shrink-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">IG Story</span>
                    <span className="text-xs text-slate-600 font-mono">
                      {STORY_W} × {STORY_H}
                    </span>
                  </div>
                  <div
                    className="relative w-full xl:w-auto xl:h-[clamp(440px,_calc(-160px_+_46.875vw),_560px)] rounded-xl overflow-hidden bg-slate-950 shadow-2xl shadow-black/50 ring-1 ring-slate-700/50"
                    style={{ aspectRatio: `${STORY_W}/${STORY_H}`, maxWidth: STORY_PREVIEW_MAX_W }}
                  >
                    <canvas
                      ref={storyCanvasRef}
                      width={STORY_W}
                      height={STORY_H}
                      className="absolute inset-0 w-full h-full"
                    />
                  </div>
                </div>
              </>
            )}

          </div>

          {assetsError && (
            <div className="mt-6 p-3 bg-red-900/20 border border-red-800/40 rounded-lg max-w-sm shrink-0">
              <p className="text-red-400 text-sm font-medium">Failed to load overlay assets</p>
              <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                Place the PNG files in{' '}
                <span className="font-mono text-slate-400">public/assets/</span>
                {' '}then refresh the page.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
