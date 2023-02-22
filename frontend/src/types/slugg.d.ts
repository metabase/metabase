declare module "slugg" {
  type Separator = string;
  type ToStrip = string | RegExp;

  type Options = {
    separator?: Separator;
    toStrip?: ToStrip;
    toLowerCase?: boolean;
  };

  export default function slugg(
    str: string,
    separatorOrOptions?: Separator | Options,
    toStrip?: ToStrip,
  );
}
