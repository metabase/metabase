import { Link } from "metabase/common/components/Link";

export const InternalLink = ({
  onInternalLinkClick,
  href,
  children,
  ...rest
}: {
  onInternalLinkClick?: (href: string) => void;
  href: string;
  children: React.ReactNode;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
  if (onInternalLinkClick) {
    return (
      <a {...rest} onClick={() => onInternalLinkClick(href)}>
        {children}
      </a>
    );
  }

  return (
    <Link to={href} variant="brand" {...rest}>
      {children}
    </Link>
  );
};
