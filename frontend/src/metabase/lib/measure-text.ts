let canvas: HTMLCanvasElement | null = null;

export type FontStyle = {
  size: string;
  family: string;
  weight: string;
};

export const measureText = (text: string, style: FontStyle) => {
  canvas ??= document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not create canvas context");
  }

  context.font = `${style.weight} ${style.size} ${style.family}`;
  return context.measureText(text);
};
