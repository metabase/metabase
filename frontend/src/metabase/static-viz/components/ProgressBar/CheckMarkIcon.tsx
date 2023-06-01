interface CheckMarkIconProps {
  size: number;
  color: string;
  x?: number;
  y?: number;
}

export const CheckMarkIcon = ({
  size = 16,
  color,
  x,
  y,
}: CheckMarkIconProps) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" x={x} y={y}>
    <path
      d="M9 19.5L12 16.5L18 22.5L28.5 12L31.5 15L18 28.5L9 19.5Z"
      fill={color}
    />
    <path
      d="M38.5 20C38.5 30.2173 30.2173 38.5 20 38.5C9.78273 38.5 1.5 30.2173 1.5 20C1.5 9.78273 9.78273 1.5 20 1.5C30.2173 1.5 38.5 9.78273 38.5 20Z"
      stroke={color}
      strokeWidth="3"
    />
  </svg>
);
