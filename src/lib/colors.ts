export type PalettePreset = {
  id: string;
  label: string;
  textColor: string;
  frameColor: string;
  isCustom?: boolean;
};

export const BASE_COLORS = [
  { id: 'blue',   label: 'Blue',   value: '#31A3FB' },
  { id: 'green',  label: 'Green',  value: '#00BB72' },
  { id: 'purple', label: 'Purple', value: '#965AFF' },
  { id: 'orange', label: 'Orange', value: '#FFA200' },
  { id: 'red',    label: 'Red',    value: '#FF5959' },
  { id: 'gold',   label: 'Gold',   value: '#FFD200' },
  { id: 'pink',   label: 'Pink',   value: '#FF8CEB' },
  { id: 'black',  label: 'Black',  value: '#000000' },
] as const;

export type BaseColorId = (typeof BASE_COLORS)[number]['id'];

export const PRESET_PALETTES: PalettePreset[] = [
  { id: 'green-blue',   label: 'Green text / Blue frame',   textColor: '#00BB72', frameColor: '#31A3FB' },
  { id: 'blue-purple',  label: 'Blue text / Purple frame',  textColor: '#31A3FB', frameColor: '#965AFF' },
  { id: 'green-orange', label: 'Green text / Orange frame', textColor: '#00BB72', frameColor: '#FFA200' },
  { id: 'red-blue',     label: 'Red text / Blue frame',     textColor: '#FF5959', frameColor: '#31A3FB' },
  { id: 'pink-gold',    label: 'Pink text / Gold frame',    textColor: '#FF8CEB', frameColor: '#FFD200' },
  { id: 'gold-green',   label: 'Gold text / Green frame',   textColor: '#FFD200', frameColor: '#00BB72' },
  { id: 'custom',       label: 'Custom\u2026',              textColor: '#00BB72', frameColor: '#31A3FB', isCustom: true },
];

/** Find the closest BASE_COLORS id for a given hex value. */
export function findBaseColorId(hex: string): BaseColorId {
  const match = BASE_COLORS.find(
    (c) => c.value.toLowerCase() === hex.toLowerCase()
  );
  return (match?.id ?? 'green') as BaseColorId;
}
