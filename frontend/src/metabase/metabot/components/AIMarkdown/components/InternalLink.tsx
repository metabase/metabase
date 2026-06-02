import { Link } from "metabase/common/components/Link";

export const InternalLink = ({
  onInternalLinkClick,
  href,
  children,
  onClick,
  ...rest
}: {
  onInternalLinkClick?: (href: string) => void;
  href: string;
  children: React.ReactNode;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
  if (onInternalLinkClick) {
    return (
      <a
        {...rest}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) {
            onInternalLinkClick(href);
          }
        }}
      >
        {children}
      </a>
    );
  }

  return (
    <Link to={href} variant="brand" onClick={onClick} {...rest}>
      {children}
    </Link>
  );
};
