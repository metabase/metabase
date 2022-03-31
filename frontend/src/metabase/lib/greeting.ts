import _ from "underscore";
import { t } from "ttag";

export const sayHello = (name: string): string => {
  const messages = [
    t`Hey there, ${name}`,
    t`How's it going, ${name}?`,
    t`Howdy, ${name}`,
    t`Greetings, ${name}`,
    t`Good to see you, ${name}`,
  ];

  return _.sample(messages) ?? "";
};
