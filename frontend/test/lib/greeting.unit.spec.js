import { Greeting, greetingPrefixes, subheadPrefixes } from "metabase/lib/greeting";

describe('Greeting', () => {
    describe('simpleGreeting', () => {
        it('should return a quote from greetingPrefixes', () => {
            const quote = Greeting.simpleGreeting()
            expect(Object.values(greetingPrefixes)).toContain(quote)
        })
    })

    describe('encourageCuriosity', () => {
        it('should return a quote from subheadPrefixes', () => {
            const quote = Greeting.encourageCuriosity()
            expect(Object.values(subheadPrefixes)).toContain(quote)
        })
    })

    describe('sayHello', () => {
        const _oldSimpleGreetingFn = Greeting.simpleGreeting;
        const myMockGreeting = jest.fn();

        beforeEach(function() {
            Greeting.simpleGreeting = myMockGreeting;
        });

         afterEach(function() {
            Greeting.simpleGreeting = _oldSimpleGreetingFn;
         });


        describe("without personalization", () => {
            it('should return a simple greeting', () => {
                myMockGreeting.mockReturnValue("My mock greeting");

                expect(Greeting.sayHello()).toEqual("My mock greeting");
            })

            it('should return the quote with a question mark if the quote is a question', () => {
                myMockGreeting.mockReturnValue("How's it going");

                expect(Greeting.sayHello()).toEqual("How's it going?");
            })
        })

        describe("with personalization", () => {

            it('should return the quote with a question mark if the quote is a question', () => {
                myMockGreeting.mockReturnValue("How's it going");

                expect(Greeting.sayHello("Joseph")).toEqual("How's it going, Joseph?");
            })

            it('should return the personalization concatened with a simple greeting', () => {
                myMockGreeting.mockReturnValue("My mock greeting");

                expect(Greeting.sayHello("Joseph")).toEqual("My mock greeting, Joseph");
            })
        })


    })
})
