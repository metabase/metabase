import { t } from 'c-3po'
import _ from "underscore";

export const questionGreetingPrefixes = [
    t`How's it going`
];

export const greetingPrefixes = [
    ...questionGreetingPrefixes,
    t`Hey there`,
    t`Howdy`,
    t`Greetings`,
    t`Good to see you`
];

export const subheadPrefixes = [
    t`What do you want to know?`,
    t`What's on your mind?`,
    t`What do you want to find out?`
];

function isQuoteAQuestion(quote) {
    return _.contains(questionGreetingPrefixes, quote);
}

export function simpleGreeting() {
    return _.sample(greetingPrefixes);
}

export function sayHello(personalization, greetingGeneratorFn = simpleGreeting) {
    let greetingQuote = greetingGeneratorFn();
    let finalGreeting = greetingQuote;

    if(personalization) {
        finalGreeting += ', ' + personalization;
    }

    if(isQuoteAQuestion(greetingQuote)) {
        finalGreeting += '?';
    }

    return finalGreeting;
}

export function encourageCuriosity() {
    return _.sample(subheadPrefixes);
}
