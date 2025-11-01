export type BotConfig = { profile: string; debug: boolean };

export type Playground = {
  iframe: {
    src: string;
    width: string;
    height: string;
  };
  bot: BotConfig;
};
