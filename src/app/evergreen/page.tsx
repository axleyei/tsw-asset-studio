// The Evergreen generator now lives at /. Redirecting there.
import { redirect } from 'next/navigation';

export default function EvergreenRedirect() {
  redirect('/');
}
