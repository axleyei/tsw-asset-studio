import type { Metadata } from 'next';
import EvergreenApp from '@/components/EvergreenApp';

export const metadata: Metadata = {
  title: 'TSW Asset Studio',
  description: 'Create image assets for The So What',
};

export default function HomePage() {
  return <EvergreenApp />;
}
