declare module "*.svg" {
  const value: string;

  export default value;
}

declare module "*.svg?url" {
  const value: string;

  export default value;
}

declare module "*.svg?source" {
  const value: string;

  export default value;
}

declare module "*.svg?component" {
  import type React from "react";
  const Component: React.VFC<React.SVGProps<SVGSVGElement>>;

  export default Component;
}
