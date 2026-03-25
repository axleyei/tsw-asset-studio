'use client';

import Link from 'next/link';

export default function TopBar() {
  return (
    <header className="bg-slate-950 border-b border-slate-700/60 px-6 shrink-0 flex items-center h-16">
      {/* Left: App branding → homepage */}
      <Link href="/" className="flex-1 min-w-0 group">
        <p className="text-base font-bold tracking-tight leading-none text-white group-hover:text-slate-200 transition-colors">
          <em className="not-italic font-bold italic">TSW</em> Asset Studio
        </p>
        <p className="text-xs text-slate-400 mt-1 leading-none group-hover:text-slate-300 transition-colors">
          Create image assets for <em>The So What</em>
        </p>
      </Link>

      {/* Right: AW logo */}
      <div className="flex justify-end items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/AW-horizontal.svg"
          alt="Artemis Ward"
          className="h-7 w-auto opacity-90"
          style={{ filter: 'brightness(0) invert(1)' }}
        />
      </div>
    </header>
  );
}
