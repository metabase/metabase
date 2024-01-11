import { PublicEmbedIconRoot } from "./PublicEmbedIcon.styled";

interface PublicEmbedIconProps {
  disabled: boolean;
}
export const PublicEmbedIcon = ({ disabled }: PublicEmbedIconProps) => (
  <PublicEmbedIconRoot
    disabled={disabled}
    width="42"
    height="34"
    viewBox="0 0 42 34"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect
      x="1.25"
      y="1.25"
      width="37.5"
      height="29.5"
      rx="2.75"
      stroke="currentColor"
      strokeWidth="2.5"
    />
    <path
      d="M6 11C6 10.4477 6.44772 10 7 10H33C33.5523 10 34 10.4477 34 11V18C34 18.5523 33.5523 19 33 19H7C6.44772 19 6 18.5523 6 18V11Z"
      className="innerFill"
      strokeWidth="2"
    />
    <rect x="5" y="5" width="30" height="2" fill="currentColor" />
    <rect x="5" y="22" width="30" height="2" fill="currentColor" />
    <rect x="5" y="26" width="30" height="2" fill="currentColor" />
  </PublicEmbedIconRoot>
);
