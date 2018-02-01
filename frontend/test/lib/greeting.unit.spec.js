import { sayHello, simpleGreeting, encourageCuriosity, greetingPrefixes, subheadPrefixes } from "metabase/lib/greeting";

describe('greeting', () => {
    describe('simpleGreeting', () => {
        it('should return a quote from greetingPrefixes', () => {
            const quote = simpleGreeting()
            expect(Object.values(greetingPrefixes)).toContain(quote)
        })
    })

    describe('encourageCuriosity', () => {
        it('should return a quote from subheadPrefixes', () => {
            const quote = encourageCuriosity()
            expect(Object.values(subheadPrefixes)).toContain(quote)
        })
    })

    describe('sayHello', () => {
        let mockGreetingQuote = "REPLACE_ME";
        const myMockGreeting = function() {
            return mockGreetingQuote;
        };

        describe("without personalization", () => {
            it('should return a simple greeting', () => {
                mockGreetingQuote = "My mock greeting";

                expect(sayHello(null, myMockGreeting)).toEqual("My mock greeting");
            })

            it('should return the quote with a question mark if the quote is a question', () => {
                mockGreetingQuote = "How's it going";
                expect(sayHello(null, myMockGreeting)).toEqual("How's it going?");
            })
        })

        describe("with personalization", () => {
            it('should return the quote with a question mark if the quote is a question', () => {
                mockGreetingQuote = "How's it going";

                expect(sayHello("Joseph", myMockGreeting)).toEqual("How's it going, Joseph?");
            })

            it('should return the personalization concatened with a simple greeting', () => {
                mockGreetingQuote = "My mock greeting";

                expect(sayHello("Joseph", myMockGreeting)).toEqual("My mock greeting, Joseph");
            })
        })


    })
})
