declare module 'gifenc' {
  interface GIFFrameOptions {
    /** Color table array from quantize() — required on first frame */
    palette?: number[][];
    /** Frame delay in milliseconds */
    delay?: number;
    /** Loop count: 0 = forever, -1 = once, N = N repetitions */
    repeat?: number;
    /** Enable 1-bit transparency */
    transparent?: boolean;
    /** Palette index to treat as transparent */
    transparentIndex?: number;
    /** GIF dispose flag (-1 = default) */
    dispose?: number;
  }

  interface GIFStream {
    writeByte(byte: number): void;
    writeBytes(arr: Uint8Array, offset?: number, byteLength?: number): void;
  }

  interface GIFEncoder {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: GIFFrameOptions,
    ): void;
    finish(): void;
    bytes(): Uint8Array<ArrayBuffer>;
    bytesView(): Uint8Array<ArrayBuffer>;
    reset(): void;
    buffer: ArrayBuffer;
    stream: GIFStream;
  }

  export function GIFEncoder(opts?: { auto?: boolean }): GIFEncoder;

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    opts?: {
      format?: 'rgb565' | 'rgb444' | 'rgba4444';
      oneBitAlpha?: boolean | number;
      clearAlpha?: boolean;
      clearAlphaThreshold?: number;
      clearAlphaColor?: number;
    },
  ): number[][];

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: string,
  ): Uint8Array;
}
