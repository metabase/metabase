declare module "*.svg" {
  const value: string;

  // eslint-disable-next-line import/no-default-export
  export default value;
}

declare module "*.svg?source" {
  const value: string;

  // eslint-disable-next-line import/no-default-export
  export default value;
}

declare module "*.svg?component" {
  import type React from "react";
  const Component: React.VFC<React.SVGProps<SVGSVGElement>>;

  // eslint-disable-next-line import/no-default-export
  export default Component;
}
