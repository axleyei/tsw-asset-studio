# TSW Asset Studio

Internal image asset generator for [*The So What*](https://www.thesowhat.com/) publication, built by [Artemis Ward](https://www.artemisward.com/).

**Live:** https://tsw-asset-studio.vercel.app/

---

## Tools

### Evergreen
Generates two assets from a single feature image:
- **Thumbnail** — 1456 × 1048 px
- **IG Story** — 1080 × 1920 px (includes headline, author name, and title)

### The Friday Mixer
Generates a thumbnail (1456 × 1048 px) with *The Friday Mixer* hand-drawn text graphic overlaid on the left half of the image. Text color is selectable from a fixed palette.

---

## Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Stack

- [Next.js 15](https://nextjs.org/) (App Router)
- React 19, TypeScript, Tailwind CSS
- Canvas API for compositing and export
- Deployed on [Vercel](https://vercel.com/)

---

## Asset files

Static overlay assets live in `public/assets/`. The following files are required at runtime:

| File | Used by |
|---|---|
| `grain_thumbnail.png` | Both tools |
| `so_logo_thumbnail.png` | Both tools |
| `tfm_text_fill.png` | Friday Mixer |
| `tfm_text_outline.png` | Friday Mixer |
| `grain_story.png` | Evergreen (IG Story) |
| `logo_story.png` | Evergreen (IG Story) |

Legacy Friday Mixer assets are archived in `public/assets/deprecated/`.
