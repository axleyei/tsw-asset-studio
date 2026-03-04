'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  BASE_COLORS,
  PRESET_PALETTES,
  findBaseColorId,
  type BaseColorId,
} from '@/lib/colors';
import {
  preloadAssets,
  renderFrameVariant,
  exportPNG,
  exportGIF,
  loadImage,
  CANVAS_W,
  CANVAS_H,
  ANIMATION_SEQUENCE,
  type FrameVariant,
} from '@/lib/compositor';

// ─── Small helpers ────────────────────────────────────────────────────────────

function ColorSwatch({ hex, size = 12 }: { hex: string; size?: number }) {
  return (
    <span
      className="inline-block rounded-full border border-white/20 shrink-0"
      style={{ width: size, height: size, backgroundColor: hex }}
    />
  );
}

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

// ─── Main component ───────────────────────────────────────────────────────────

export default function FridayMixerApp() {
  // Form state
  const [issueNumber, setIssueNumber] = useState('');
  const [issueError, setIssueError] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState('green-blue');
  const [customTextColorId, setCustomTextColorId] = useState<BaseColorId>('green');
  const [customFrameColorId, setCustomFrameColorId] = useState<BaseColorId>('blue');

  // Image state
  const [featureImage, setFeatureImage] = useState<HTMLImageElement | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [imageInfo, setImageInfo] = useState<{ w: number; h: number } | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Asset / app state
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [assetsError, setAssetsError] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingGif, setIsExportingGif] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevThumbnailRef = useRef<string | null>(null);
  const animIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFrameIndexRef = useRef(0);

  // ─── Derived ──────────────────────────────────────────────────────────────

  const selectedPreset = PRESET_PALETTES.find((p) => p.id === selectedPresetId)!;
  const isCustom = !!selectedPreset.isCustom;

  const effectiveTextColor = isCustom
    ? BASE_COLORS.find((c) => c.id === customTextColorId)!.value
    : selectedPreset.textColor;

  const effectiveFrameColor = isCustom
    ? BASE_COLORS.find((c) => c.id === customFrameColorId)!.value
    : selectedPreset.frameColor;

  const issueValid =
    issueNumber.trim() !== '' &&
    /^\d+$/.test(issueNumber.trim()) &&
    parseInt(issueNumber.trim(), 10) > 0;

  const canExport = !!featureImage && !imageError && issueValid && assetsLoaded;

  // ─── Asset loading ────────────────────────────────────────────────────────

  useEffect(() => {
    preloadAssets()
      .then(() => setAssetsLoaded(true))
      .catch(() => setAssetsError(true));
  }, []);

  // ─── Animation cleanup on unmount ─────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (animIntervalRef.current) {
        clearInterval(animIntervalRef.current);
      }
    };
  }, []);

  // ─── Canvas re-render (skipped while animation is playing) ────────────────

  useEffect(() => {
    if (!assetsLoaded || !canvasRef.current || isAnimating) return;
    renderFrameVariant({
      canvas: canvasRef.current,
      featureImage,
      textColor: effectiveTextColor,
      frameColor: effectiveFrameColor,
      variant: 'A',
    });
  }, [assetsLoaded, featureImage, effectiveTextColor, effectiveFrameColor, isAnimating]);

  // ─── Image handling ───────────────────────────────────────────────────────

  const processFile = useCallback(async (file: File) => {
    if (!file.type.match(/^image\/(png|jpe?g|webp)$/)) {
      setImageError('Please upload a PNG or JPG image.');
      return;
    }

    // Revoke previous object URL to avoid memory leaks
    if (prevThumbnailRef.current) {
      URL.revokeObjectURL(prevThumbnailRef.current);
    }

    const url = URL.createObjectURL(file);
    prevThumbnailRef.current = url;

    try {
      const img = await loadImage(url);

      if (img.naturalWidth !== img.naturalHeight) {
        setImageError('Image must be square (width must equal height).');
        setFeatureImage(null);
        setThumbnailUrl(null);
        setImageInfo(null);
        return;
      }

      if (img.naturalWidth < 950 || img.naturalHeight < 950) {
        setImageError('Image must be at least 950×950 pixels.');
        setFeatureImage(null);
        setThumbnailUrl(null);
        setImageInfo(null);
        return;
      }

      setFeatureImage(img);
      setThumbnailUrl(url);
      setImageInfo({ w: img.naturalWidth, h: img.naturalHeight });
      setImageError(null);
    } catch {
      setImageError('Failed to load image. Please try another file.');
      setFeatureImage(null);
      setThumbnailUrl(null);
      setImageInfo(null);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  // ─── Preset change ────────────────────────────────────────────────────────

  const handlePresetChange = (newId: string) => {
    if (newId === 'custom' && !isCustom) {
      // Seed custom colors from the previously selected preset
      setCustomTextColorId(findBaseColorId(selectedPreset.textColor));
      setCustomFrameColorId(findBaseColorId(selectedPreset.frameColor));
    }
    setSelectedPresetId(newId);
  };

  // ─── Issue number ─────────────────────────────────────────────────────────

  const handleIssueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setIssueNumber(val);
    setIssueError(
      val.trim() !== '' &&
        (!/^\d+$/.test(val.trim()) || parseInt(val.trim(), 10) <= 0)
    );
  };

  // ─── Export: Still PNG ────────────────────────────────────────────────────

  const handleExport = () => {
    if (!canvasRef.current || !canExport || isExporting || isAnimating) return;
    setIsExporting(true);
    exportPNG(
      canvasRef.current,
      featureImage,
      effectiveTextColor,
      effectiveFrameColor,
      issueNumber.trim(),
    );
    setTimeout(() => setIsExporting(false), 500);
  };

  // ─── Preview animation ────────────────────────────────────────────────────

  // Preview runs at 200ms/frame so the cycle is visible; exported GIF uses 10ms.
  const PREVIEW_INTERVAL_MS = 200;

  const handlePreviewAnimation = useCallback(() => {
    if (!canvasRef.current) return;

    if (isAnimating) {
      // Stop: clear the interval and restore A variant
      if (animIntervalRef.current) {
        clearInterval(animIntervalRef.current);
        animIntervalRef.current = null;
      }
      setIsAnimating(false);
      // A-variant re-render is handled by the canvas useEffect reacting to
      // isAnimating becoming false.
    } else {
      // Start animation
      animFrameIndexRef.current = 0;
      setIsAnimating(true);

      // Capture current render params for the closure
      const canvas = canvasRef.current;
      const image = featureImage;
      const tColor = effectiveTextColor;
      const fColor = effectiveFrameColor;

      animIntervalRef.current = setInterval(() => {
        const variant: FrameVariant =
          ANIMATION_SEQUENCE[animFrameIndexRef.current % ANIMATION_SEQUENCE.length];
        renderFrameVariant({
          canvas,
          featureImage: image,
          textColor: tColor,
          frameColor: fColor,
          variant,
        });
        animFrameIndexRef.current++;
      }, PREVIEW_INTERVAL_MS);
    }
  }, [isAnimating, featureImage, effectiveTextColor, effectiveFrameColor]);

  // ─── Export: Animated GIF ─────────────────────────────────────────────────

  const handleExportGif = useCallback(async () => {
    if (!canExport || isExportingGif || isAnimating) return;
    setIsExportingGif(true);
    try {
      await exportGIF(
        { featureImage, textColor: effectiveTextColor, frameColor: effectiveFrameColor },
        issueNumber.trim(),
      );
    } finally {
      setIsExportingGif(false);
    }
  }, [canExport, isExportingGif, isAnimating, featureImage, effectiveTextColor, effectiveFrameColor, issueNumber]);

  // ─── Render ───────────────────────────────────────────────────────────────

  const exportFilename = issueValid ? `TheFridayMixer-${issueNumber.trim()}` : null;

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-700/60 px-6 py-4 shrink-0">
        <h1 className="text-lg font-bold tracking-tight">
          Friday Mixer Generator
        </h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Composite cover images for The Friday Mixer
        </p>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <main className="flex gap-6 p-6 flex-1 min-h-0">
        {/* ── Left column: Controls ──────────────────────────────────────── */}
        <div className="w-72 shrink-0 flex flex-col gap-4">
          {/* Issue number */}
          <SectionCard title="Issue">
            <label className="block text-sm text-slate-400 mb-1">
              Issue #
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={issueNumber}
              onChange={handleIssueChange}
              placeholder="32"
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

          {/* Image upload */}
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
                  : imageError
                  ? 'border-red-500/50 bg-red-500/5 hover:border-red-400/60'
                  : featureImage
                  ? 'border-green-500/40 bg-green-500/5 hover:border-green-400/60'
                  : 'border-slate-600 hover:border-slate-400',
              ].join(' ')}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileInput}
              />

              {thumbnailUrl && featureImage ? (
                <div className="p-3 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbnailUrl}
                    alt="Feature image thumbnail"
                    className="w-14 h-14 object-cover rounded shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-green-400 font-medium">
                      Image loaded
                    </p>
                    {imageInfo && (
                      <p className="text-xs text-slate-400 mt-0.5 font-mono">
                        {imageInfo.w}×{imageInfo.h}
                      </p>
                    )}
                    <p className="text-xs text-slate-500 mt-1">
                      Click to replace
                    </p>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-6 text-center">
                  <div className="text-2xl mb-2 text-slate-500">↑</div>
                  <p className="text-sm text-slate-300 font-medium">
                    Upload feature image
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Square · ≥&thinsp;950×950 px · PNG or JPG
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    Click or drag &amp; drop
                  </p>
                </div>
              )}
            </div>

            {imageError && (
              <p className="text-xs text-red-400 leading-relaxed">{imageError}</p>
            )}
          </SectionCard>

          {/* Color pairing */}
          <SectionCard title="Colors">
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Color pairing
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex gap-1 pointer-events-none">
                  <ColorSwatch hex={effectiveTextColor} />
                  <ColorSwatch hex={effectiveFrameColor} />
                </div>
                <select
                  value={selectedPresetId}
                  onChange={(e) => handlePresetChange(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-10 pr-8 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 appearance-none cursor-pointer"
                >
                  {PRESET_PALETTES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs">
                  ▾
                </span>
              </div>
            </div>

            {isCustom && (
              <div className="space-y-3 pt-3 border-t border-slate-700/60">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    Text color
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <ColorSwatch hex={effectiveTextColor} />
                    </div>
                    <select
                      value={customTextColorId}
                      onChange={(e) =>
                        setCustomTextColorId(e.target.value as BaseColorId)
                      }
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-9 pr-8 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 appearance-none cursor-pointer"
                    >
                      {BASE_COLORS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs">
                      ▾
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    Frame color
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <ColorSwatch hex={effectiveFrameColor} />
                    </div>
                    <select
                      value={customFrameColorId}
                      onChange={(e) =>
                        setCustomFrameColorId(e.target.value as BaseColorId)
                      }
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-9 pr-8 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 appearance-none cursor-pointer"
                    >
                      {BASE_COLORS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs">
                      ▾
                    </span>
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Export buttons */}
          <div className="space-y-2">
            {/* Download Still PNG */}
            <button
              onClick={handleExport}
              disabled={!canExport || isExporting || isAnimating}
              className={[
                'w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all',
                canExport && !isExporting && !isAnimating
                  ? 'bg-white text-slate-900 hover:bg-slate-100 active:scale-[0.98] shadow-lg shadow-white/10'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed',
              ].join(' ')}
            >
              {isExporting ? 'Exporting…' : 'Download Still PNG'}
            </button>

            {/* Preview Animation */}
            <button
              onClick={handlePreviewAnimation}
              disabled={!canExport}
              className={[
                'w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all',
                canExport
                  ? isAnimating
                    ? 'bg-amber-500 text-slate-900 hover:bg-amber-400 active:scale-[0.98]'
                    : 'bg-slate-600 text-white hover:bg-slate-500 active:scale-[0.98]'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed',
              ].join(' ')}
            >
              {isAnimating ? 'Stop' : 'Preview Animation'}
            </button>

            {/* Download Animated GIF */}
            <button
              onClick={handleExportGif}
              disabled={!canExport || isExportingGif || isAnimating}
              className={[
                'w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all',
                canExport && !isExportingGif && !isAnimating
                  ? 'bg-slate-600 text-white hover:bg-slate-500 active:scale-[0.98]'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed',
              ].join(' ')}
            >
              {isExportingGif ? 'Encoding GIF…' : 'Download Animated GIF'}
            </button>

            {!canExport && (
              <p className="text-xs text-slate-600 text-center leading-relaxed">
                {assetsError
                  ? 'Asset load failed — see preview.'
                  : !issueValid && !featureImage
                  ? 'Enter an issue number and upload an image.'
                  : !issueValid
                  ? 'Enter a valid issue number.'
                  : !featureImage || imageError
                  ? 'Upload a valid square image (≥ 950 px).'
                  : ''}
              </p>
            )}

            {exportFilename && (
              <p className="text-xs text-slate-500 text-center font-mono truncate">
                {exportFilename}.png / .gif
              </p>
            )}
          </div>
        </div>

        {/* ── Right column: Preview ──────────────────────────────────────── */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              Preview
            </h2>
            <span className="text-xs text-slate-600 font-mono">
              {CANVAS_W} × {CANVAS_H} px
            </span>
          </div>

          <div
            className="relative w-full rounded-xl overflow-hidden bg-slate-950 shadow-2xl shadow-black/50 ring-1 ring-slate-700/50"
            style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
          >
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className="absolute inset-0 w-full h-full"
            />

            {!assetsLoaded && !assetsError && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90">
                <p className="text-slate-500 text-sm">Loading assets…</p>
              </div>
            )}

            {assetsError && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 px-8">
                <div className="text-center space-y-2">
                  <p className="text-red-400 text-sm font-medium">
                    Failed to load overlay assets
                  </p>
                  <p className="text-slate-500 text-xs leading-relaxed">
                    Place the PNG files in{' '}
                    <span className="font-mono text-slate-400">
                      public/assets/
                    </span>
                    <br />
                    then refresh the page.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <ColorSwatch hex={effectiveTextColor} />
              Text
            </span>
            <span className="flex items-center gap-1.5">
              <ColorSwatch hex={effectiveFrameColor} />
              Frame
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
