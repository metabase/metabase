interface PointerProps {
  width: number;
  height: number;
  fill?: string;
}

export const Pointer = ({ width, height, fill }: PointerProps) => {
  const points = [
    [-width / 2, 0],
    [width / 2, 0],
    [0, height],
  ]
    .map(point => point.join(","))
    .join(" ");

  return <polygon fill={fill} points={points} />;
};
