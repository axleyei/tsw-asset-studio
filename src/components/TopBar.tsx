'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  {
    label: 'Friday Mixer',
    href: '/friday-mixer',
    thumbnail: '/assets/example-friday-mixer.jpg',
  },
  {
    label: 'Evergreen Content',
    href: '/evergreen',
    thumbnail: '/assets/example-evergreen.jpg',
  },
];

export default function TopBar() {
  const pathname = usePathname();

  return (
    <header className="bg-slate-950 border-b border-slate-700/60 px-6 shrink-0 flex items-center h-16 gap-8">
      {/* Left: App branding → homepage */}
      <Link href="/" className="flex-1 min-w-0 group">
        <p className="text-base font-bold tracking-tight leading-none text-white group-hover:text-slate-200 transition-colors">
          <em className="not-italic font-bold italic">TSW</em> Asset Studio
        </p>
        <p className="text-xs text-slate-400 mt-1 leading-none group-hover:text-slate-300 transition-colors">
          Create image assets for <em>The So What</em>
        </p>
      </Link>

      {/* Center: Mini nav tiles with squircle outline */}
      <nav className="flex items-center gap-2 shrink-0">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex items-center gap-2.5 pl-2 pr-4 py-2 rounded-xl text-sm font-medium transition-all border',
                isActive
                  ? 'bg-slate-700 border-slate-600 text-white'
                  : 'bg-transparent border-slate-600/50 text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-800/50',
              ].join(' ')}
            >
              {/* Mini thumbnail */}
              <div className="w-10 h-7 rounded-md overflow-hidden bg-slate-700 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.thumbnail}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Right: AW logo */}
      <div className="flex-1 flex justify-end items-center min-w-0">
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
