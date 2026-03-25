// DEPRECATED — The Friday Mixer tool has been superseded by the Friday Mixer
// mode inside the main app at /. This route is kept for reference only and
// is not actively maintained.
import type { Metadata } from 'next';
import FridayMixerApp from '@/components/FridayMixerApp';

export const metadata: Metadata = {
  title: 'Friday Mixer — TSW Asset Studio',
  description: 'Composite cover images for The Friday Mixer newsletter',
};

export default function FridayMixerPage() {
  return <FridayMixerApp />;
}
