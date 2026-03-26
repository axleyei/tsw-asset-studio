import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import TopBar from '@/components/TopBar';

const inter = Inter({ subsets: ['latin'] });

const BASE_URL = 'https://tsw-asset-studio.vercel.app';

export const metadata: Metadata = {
  title: 'TSW Asset Studio',
  description: 'Create image assets for The So What',
  metadataBase: new URL(BASE_URL),
  openGraph: {
    title: 'TSW Asset Studio',
    description: 'Create image assets for The So What',
    url: BASE_URL,
    siteName: 'TSW Asset Studio',
    images: [
      {
        url: '/assets/example-evergreen.jpg',
        width: 728,
        height: 524,
        alt: 'TSW Asset Studio',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TSW Asset Studio',
    description: 'Create image assets for The So What',
    images: ['/assets/example-evergreen.jpg'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} h-screen flex flex-col bg-slate-900 text-white`}>
        <TopBar />
        <div className="flex-1 min-h-0">
          {children}
        </div>
      </body>
    </html>
  );
}
