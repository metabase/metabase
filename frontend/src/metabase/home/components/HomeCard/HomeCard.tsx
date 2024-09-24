import type { ReactNode } from "react";

import { CardRoot } from "./HomeCard.styled";

interface HomeCardProps {
  className?: string;
  url?: string;
  external?: boolean;
  children?: ReactNode;
  onClick?: () => void;
}

export const HomeCard = ({
  className,
  url = "",
  children,
  onClick, // Aceptar el onClick
}: HomeCardProps): JSX.Element => {
  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.preventDefault(); 
      onClick();
    }
  };

  return (
    <CardRoot className={className} to={url} onClick={handleClick}>
      {children}
    </CardRoot>
  );
};
