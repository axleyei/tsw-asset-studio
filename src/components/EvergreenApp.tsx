'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Canvas dimensions ────────────────────────────────────────────────────────

const THUMB_W = 1456;
const THUMB_H = 1048;
const STORY_W = 1080;
const STORY_H = 1920;

// IG Story preview max-width (portrait — cap so it doesn't overwhelm the column)
const STORY_PREVIEW_MAX_W = 360;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  canvasW: number,
  canvasH: number,
) {
  const scale = Math.max(canvasW / img.naturalWidth, canvasH / img.naturalHeight);
  const drawW = img.naturalWidth * scale;
  const drawH = img.naturalHeight * scale;
  const x = (canvasW - drawW) / 2;
  const y = (canvasH - drawH) / 2;
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

function OpacitySlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <label className="text-sm text-slate-400">{label}</label>
        <span className="text-xs text-slate-500 font-mono tabular-nums">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer accent-blue-400 h-1.5"
      />
    </div>
  );
}

// ─── Asset types ──────────────────────────────────────────────────────────────

interface Assets {
  grainThumbnail: HTMLImageElement;
  grainStory: HTMLImageElement;
  logoThumbnail: HTMLImageElement;
  logoStory: HTMLImageElement;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EvergreenApp() {
  // Issue number
  const [issueNumber, setIssueNumber] = useState('');
  const [issueError, setIssueError] = useState(false);

  // Shared image (populates both canvases by default)
  const [sharedImage, setSharedImage] = useState<HTMLImageElement | null>(null);
  const [sharedImageUrl, setSharedImageUrl] = useState<string | null>(null);
  const [sharedImageInfo, setSharedImageInfo] = useState<{ w: number; h: number } | null>(null);
  const [sharedImageError, setSharedImageError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Per-canvas image overrides
  const [thumbOverride, setThumbOverride] = useState<HTMLImageElement | null>(null);
  const [thumbOverrideUrl, setThumbOverrideUrl] = useState<string | null>(null);
  const [storyOverride, setStoryOverride] = useState<HTMLImageElement | null>(null);
  const [storyOverrideUrl, setStoryOverrideUrl] = useState<string | null>(null);

  // Thumbnail controls
  const [thumbGrainOpacity, setThumbGrainOpacity] = useState(100);
  const [thumbVeilOpacity, setThumbVeilOpacity] = useState(65);

  // IG Story controls
  const [storyGrainOpacity, setStoryGrainOpacity] = useState(100);
  const [storyVeilOpacity, setStoryVeilOpacity] = useState(60);
  const [headline, setHeadline] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [authorTitle, setAuthorTitle] = useState('');

  // Fonts & assets
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [assetsError, setAssetsError] = useState(false);
  const assetsRef = useRef<Assets | null>(null);

  // FPO placeholder (shown in canvas previews only; never exported, never shown in panel)
  const [fpoImage, setFpoImage] = useState<HTMLImageElement | null>(null);

  // Export state
  const [isExportingThumb, setIsExportingThumb] = useState(false);
  const [isExportingStory, setIsExportingStory] = useState(false);

  // Refs
  const thumbCanvasRef = useRef<HTMLCanvasElement>(null);
  const storyCanvasRef = useRef<HTMLCanvasElement>(null);
  const sharedFileRef = useRef<HTMLInputElement>(null);
  const thumbFileRef = useRef<HTMLInputElement>(null);
  const storyFileRef = useRef<HTMLInputElement>(null);
  const prevSharedUrlRef = useRef<string | null>(null);
  const prevThumbUrlRef = useRef<string | null>(null);
  const prevStoryUrlRef = useRef<string | null>(null);

  // ─── Derived state ──────────────────────────────────────────────────────────

  const issueValid =
    issueNumber.trim() !== '' &&
    /^\d+$/.test(issueNumber.trim()) &&
    parseInt(issueNumber.trim(), 10) > 0;

  const effectiveThumbImage = thumbOverride ?? sharedImage;
  const effectiveStoryImage = storyOverride ?? sharedImage;

  const canExportThumb = !!effectiveThumbImage && issueValid;
  const canExportStory =
    !!effectiveStoryImage &&
    issueValid &&
    headline.trim() !== '' &&
    authorName.trim() !== '' &&
    authorTitle.trim() !== '';

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
        // Proceed with system fallback fonts
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
    ])
      .then(([grainThumbnail, grainStory, logoThumbnail, logoStory]) => {
        assetsRef.current = { grainThumbnail, grainStory, logoThumbnail, logoStory };
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

    // 1. Feature image (fill/center cover), FPO placeholder, or dark background.
    //    FPO is purely visual — it is never set as effectiveThumbImage so it
    //    cannot satisfy canExportThumb and will never appear in a downloaded file.
    if (effectiveThumbImage) {
      drawImageCover(ctx, effectiveThumbImage, THUMB_W, THUMB_H);
    } else if (fpoImage) {
      drawImageCover(ctx, fpoImage, THUMB_W, THUMB_H);
    } else {
      ctx.fillStyle = '#0f0f0f';
      ctx.fillRect(0, 0, THUMB_W, THUMB_H);
    }

    // 2. Grain overlay — Multiply blend makes the solid PNG background transparent;
    //    only the dark grain texture darkens the image beneath.
    const assets = assetsRef.current;
    if (assetsLoaded && assets?.grainThumbnail && thumbGrainOpacity > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = thumbGrainOpacity / 100;
      ctx.drawImage(assets.grainThumbnail, 0, 0, THUMB_W, THUMB_H);
      ctx.restore(); // resets globalCompositeOperation → 'source-over', globalAlpha → 1
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

    // 4. Logo overlay (drawn at full frame size, 0,0)
    if (assetsLoaded && assets?.logoThumbnail) {
      ctx.drawImage(assets.logoThumbnail, 0, 0, THUMB_W, THUMB_H);
    }
  }, [effectiveThumbImage, fpoImage, thumbGrainOpacity, thumbVeilOpacity, assetsLoaded]);

  // ─── IG Story canvas render ──────────────────────────────────────────────────

  useEffect(() => {
    const canvas = storyCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, STORY_W, STORY_H);

    // 1. Feature image (fill/center cover), FPO placeholder, or dark background.
    //    FPO is purely visual — it cannot satisfy canExportStory and will never
    //    appear in a downloaded file.
    if (effectiveStoryImage) {
      drawImageCover(ctx, effectiveStoryImage, STORY_W, STORY_H);
    } else if (fpoImage) {
      drawImageCover(ctx, fpoImage, STORY_W, STORY_H);
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
      ctx.restore(); // resets globalCompositeOperation → 'source-over', globalAlpha → 1
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
      // Use textBaseline='top' so y=610 maps directly to the top of the text block.
      //
      // Manual line-break support: the user can press Enter in the textarea or
      // type the literal two-character sequence \n to force a break at any point.
      // Each resulting segment is independently word-wrapped so automatic wrapping
      // still applies within each segment.
      ctx.textBaseline = 'top';
      ctx.font = '300 164px EditorialNew';
      const headlineLines: string[] = headline.length > 0
        ? headline
            .replace(/\\n/g, '\n')          // literal \n → real newline
            .split('\n')                     // split on all newlines (Enter or \n)
            .flatMap((segment) =>
              segment.length > 0
                ? wrapText(ctx, segment, headlineMaxWidth)
                : [''],                      // empty segment → blank line for spacing
            )
        : [];
      const HEADLINE_TOP_Y = 610;
      const HEADLINE_LINE_H = 170;
      const HEADLINE_FONT_SIZE = 164;
      headlineLines.forEach((line, i) => {
        ctx.fillText(line, cx, HEADLINE_TOP_Y + i * HEADLINE_LINE_H);
      });

      // Approximate alphabetic baseline of the last headline line
      // (baseline ≈ top + fontSize × 0.8 for a typical serif)
      const lastLineTopY = HEADLINE_TOP_Y + Math.max(0, headlineLines.length - 1) * HEADLINE_LINE_H;
      const lastHeadlineBaseline = lastLineTopY + Math.round(HEADLINE_FONT_SIZE * 0.8);

      // Switch to alphabetic for the remaining elements whose positions are
      // specified as baselines relative to the previous element's baseline
      ctx.textBaseline = 'alphabetic';

      // Author name: EditorialNew 300, 67px, baseline = lastHeadlineBaseline + 200
      const authorBaseline = lastHeadlineBaseline + 200;
      ctx.font = '300 67px EditorialNew';
      if (authorName.trim()) {
        ctx.fillText(authorName.trim(), cx, authorBaseline);
      }

      // Author title: PowerGrotesk 500, 36px, baseline = authorBaseline + 60, toUpperCase
      const titleBaseline = authorBaseline + 60;
      ctx.font = '500 36px PowerGrotesk';
      if (authorTitle.trim()) {
        ctx.fillText(authorTitle.trim().toUpperCase(), cx, titleBaseline);
      }

      // "LINK STICKER HERE": EditorialNew 300, 47px, baseline = titleBaseline + 140
      const linkBaseline = titleBaseline + 140;
      ctx.font = '300 47px EditorialNew';
      ctx.fillText('LINK STICKER HERE', cx, linkBaseline);
    }
  }, [
    effectiveStoryImage,
    fpoImage,
    storyGrainOpacity,
    storyVeilOpacity,
    headline,
    authorName,
    authorTitle,
    assetsLoaded,
    fontsLoaded,
  ]);

  // ─── Image file processing ───────────────────────────────────────────────────

  const processImageFile = useCallback(
    async (file: File, target: 'shared' | 'thumbnail' | 'story') => {
      if (!file.type.match(/^image\/(png|jpe?g)$/)) {
        if (target === 'shared') {
          setSharedImageError('Please upload a PNG or JPG image.');
        }
        return;
      }

      const url = URL.createObjectURL(file);
      try {
        const img = await loadImage(url);

        if (target === 'shared') {
          // Revoke all old URLs; reset overrides so shared image populates both
          if (prevSharedUrlRef.current) URL.revokeObjectURL(prevSharedUrlRef.current);
          if (prevThumbUrlRef.current) URL.revokeObjectURL(prevThumbUrlRef.current);
          if (prevStoryUrlRef.current) URL.revokeObjectURL(prevStoryUrlRef.current);
          prevSharedUrlRef.current = url;
          prevThumbUrlRef.current = null;
          prevStoryUrlRef.current = null;
          setThumbOverride(null);
          setThumbOverrideUrl(null);
          setStoryOverride(null);
          setStoryOverrideUrl(null);
          setSharedImage(img);
          setSharedImageUrl(url);
          setSharedImageInfo({ w: img.naturalWidth, h: img.naturalHeight });
          setSharedImageError(null);
        } else if (target === 'thumbnail') {
          if (prevThumbUrlRef.current) URL.revokeObjectURL(prevThumbUrlRef.current);
          prevThumbUrlRef.current = url;
          setThumbOverride(img);
          setThumbOverrideUrl(url);
        } else {
          if (prevStoryUrlRef.current) URL.revokeObjectURL(prevStoryUrlRef.current);
          prevStoryUrlRef.current = url;
          setStoryOverride(img);
          setStoryOverrideUrl(url);
        }
      } catch {
        URL.revokeObjectURL(url);
        if (target === 'shared') {
          setSharedImageError('Failed to load image. Please try another file.');
        }
      }
    },
    [],
  );

  // ─── Issue number handler ────────────────────────────────────────────────────

  const handleIssueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setIssueNumber(val);
    setIssueError(
      val.trim() !== '' &&
        (!/^\d+$/.test(val.trim()) || parseInt(val.trim(), 10) <= 0),
    );
  };

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
      a.download = `TheSoWhat-Thumbnail-${issueNumber.trim()}.png`;
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); setIsExportingThumb(false); }, 500);
    }, 'image/png');
  }, [canExportThumb, isExportingThumb, issueNumber]);

  const handleExportStory = useCallback(() => {
    if (!canExportStory || isExportingStory) return;
    const canvas = storyCanvasRef.current;
    if (!canvas) return;
    setIsExportingStory(true);
    canvas.toBlob((blob) => {
      if (!blob) { setIsExportingStory(false); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `TheSoWhat-IGStory-${issueNumber.trim()}.png`;
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); setIsExportingStory(false); }, 500);
    }, 'image/png');
  }, [canExportStory, isExportingStory, issueNumber]);

  // ─── Shared file input helpers ───────────────────────────────────────────────

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
      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <main className="flex gap-6 p-6 flex-1 min-h-0">

        {/* ── Left column: Controls ──────────────────────────────────────── */}
        <div className="w-72 shrink-0 flex flex-col gap-4 overflow-y-auto pb-4">

          {/* Generator title */}
          <h1 className="text-base font-bold tracking-tight text-white px-1">Evergreen Content</h1>

          {/* Issue number */}
          <SectionCard title="Issue #">
            <input
              type="text"
              inputMode="numeric"
              value={issueNumber}
              onChange={handleIssueChange}
              placeholder="1"
              className={[
                'w-full bg-slate-700 border rounded-lg px-3 py-2.5 text-white',
                'placeholder-slate-500 focus:outline-none focus:ring-2 transition-colors',
                issueError
                  ? 'border-red-500 focus:ring-red-500/40'
                  : 'border-slate-600 focus:ring-blue-500/40',
              ].join(' ')}
            />
            {issueError && (
              <p className="text-xs text-red-400 mt-1.5">
                Please enter a valid issue number.
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
            {/* Per-canvas image override */}
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

            <OpacitySlider
              label="Grain opacity"
              value={thumbGrainOpacity}
              onChange={setThumbGrainOpacity}
            />
            <OpacitySlider
              label="Veil opacity"
              value={thumbVeilOpacity}
              onChange={setThumbVeilOpacity}
            />

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
                {!issueValid && !effectiveThumbImage
                  ? 'Enter an issue # and upload an image.'
                  : !issueValid
                  ? 'Enter a valid issue number.'
                  : 'Upload an image to continue.'}
              </p>
            ) : (
              <p className="text-xs text-slate-500 text-center font-mono truncate">
                TheSoWhat-Thumbnail-{issueNumber.trim()}.png
              </p>
            )}
          </SectionCard>

          {/* ── IG Story controls ───────────────────────────────────────────── */}
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

            <OpacitySlider
              label="Grain opacity"
              value={storyGrainOpacity}
              onChange={setStoryGrainOpacity}
            />
            <OpacitySlider
              label="Veil opacity"
              value={storyVeilOpacity}
              onChange={setStoryVeilOpacity}
            />

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
                {!issueValid && !effectiveStoryImage
                  ? 'Enter an issue # and upload an image.'
                  : !issueValid
                  ? 'Enter a valid issue number.'
                  : !effectiveStoryImage
                  ? 'Upload an image to continue.'
                  : 'Fill in headline, author name, and author title.'}
              </p>
            ) : (
              <p className="text-xs text-slate-500 text-center font-mono truncate">
                TheSoWhat-IGStory-{issueNumber.trim()}.png
              </p>
            )}
          </SectionCard>
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
            Total ~860px + gap — fits a 1280px+ viewport (right col ≈ 920px).
            Below xl they stack vertically, each filling the column width.
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

            {/* Divider — horizontal between stacked items, vertical when side-by-side */}
            <div className="xl:hidden border-t border-slate-700/50 w-full shrink-0" />
            <div className="hidden xl:block w-px self-stretch bg-slate-700/50 shrink-0" />

            {/* IG Story */}
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
