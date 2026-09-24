declare module "*?raw" {
  const content: string;
  // Vite's `?raw` suffix yields a default export, so the shape is not ours to pick.
  // eslint-disable-next-line import/no-default-export
  export default content;
}
