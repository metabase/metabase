declare module "slugg" {
  type Separator = string;
  type ToStrip = string | RegExp;

  type Options = {
    separator?: Separator;
    toStrip?: ToStrip;
    toLowerCase?: boolean;
  };

  // eslint-disable-next-line import/no-default-export -- deprecated usage
  export default function slugg(
    str: string,
    separatorOrOptions?: Separator | Options,
    toStrip?: ToStrip,
  );
}
