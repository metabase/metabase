import type { DataAppLinkProps } from "embedding-sdk-bundle/lib/data-app/router";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

export const DataAppLink = ({ to, children, ...rest }: DataAppLinkProps) => {
  const BundleDataAppLink =
    getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.DataAppLink;

  if (!BundleDataAppLink) {
    return (
      <a href={to} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <BundleDataAppLink to={to} {...rest}>
      {children}
    </BundleDataAppLink>
  );
};
