import { t } from "c-3po";

const greetingPrefixes = [
  t`Hey there`,
  t`How's it going`,
  t`Howdy`,
  t`Greetings`,
  t`Good to see you`,
];

const subheadPrefixes = [
  t`What do you want to know?`,
  t`What's on your mind?`,
  t`What do you want to find out?`,
];

const Greeting = {
  simpleGreeting: function() {
    // TODO - this can result in an undefined thing
    const randomIndex = Math.floor(
      Math.random() * (greetingPrefixes.length - 1),
    );
    return greetingPrefixes[randomIndex];
  },

  sayHello: function(personalization) {
    if (personalization) {
      let g = Greeting.simpleGreeting();
      if (g === t`How's it going`) {
        return g + ", " + personalization + "?";
      } else {
        return g + ", " + personalization;
      }
    } else {
      return Greeting.simpleGreeting();
    }
  },

  encourageCuriosity: function() {
    // TODO - this can result in an undefined thing
    const randomIndex = Math.floor(
      Math.random() * (subheadPrefixes.length - 1),
    );

    return subheadPrefixes[randomIndex];
  },
};

export default Greeting;
