export const newPulse = () => `/pulse/create`;

export function pulse(pulseId: number) {
  return `/pulse/${pulseId}`;
}

export function pulseEdit(pulseId: number) {
  return `/pulse/${pulseId}`;
}
