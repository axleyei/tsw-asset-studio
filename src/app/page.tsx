import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'TSW Asset Studio',
  description: 'Create image assets for The So What',
};

const GENERATORS = [
  {
    href: '/friday-mixer',
    label: 'Friday Mixer',
    description: 'Composite cover images for The Friday Mixer newsletter',
    thumbnail: '/assets/example-friday-mixer.jpg',
  },
  {
    href: '/evergreen',
    label: 'Evergreen Content',
    description: 'Thumbnail and IG Story images for The So What',
    thumbnail: '/assets/example-evergreen.jpg',
  },
];

export default function LandingPage() {
  return (
    <div className="h-full flex items-center justify-center p-10">
      <div className="flex gap-6 w-full max-w-2xl">
        {GENERATORS.map((gen) => (
          <Link
            key={gen.href}
            href={gen.href}
            className="flex-1 bg-slate-800 border border-slate-700/60 hover:border-slate-500/60 rounded-2xl p-5 flex flex-col gap-4 transition-all group cursor-pointer"
          >
            {/* Example image (FPO gray bg shows until image loads) */}
            <div className="w-full aspect-[14/9] bg-slate-700 rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={gen.thumbnail}
                alt={gen.label}
                className="w-full h-full object-cover"
              />
            </div>
            {/* Label */}
            <div>
              <h2 className="text-base font-bold tracking-tight group-hover:text-blue-400 transition-colors">
                {gen.label}
              </h2>
              <p className="text-slate-400 text-sm mt-1">{gen.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
