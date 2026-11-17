export type IsolationTestEnv = { instanceUrl: string };

export type Report = (result: string) => void;

export type Probe = { id: string; label: string; run: () => void };

export type ReactMode =
  | "react-iframe-about-blank"
  | "react-iframe-src"
  | "react-iframe-srcdoc"
  | "react-inner-html"
  | "react-custom-element";

export type ReactProbe = { id: string; label: string; mode: ReactMode };
