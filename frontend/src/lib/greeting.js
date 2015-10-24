const greetingPrefixes = [
    'Olá,',
    'Como está indo,',
    'Saudações,',
    'Bom te ver,',
];

const subheadPrefixes = [
    'O que você quer saber?',
    'O que está em sua mente?',
    'No que você está pensando?',
];


var Greeting = {
    simpleGreeting: function() {
        // TODO - this can result in an undefined thing
        const randomIndex = Math.floor(Math.random() * (greetingPrefixes.length - 1));
        return greetingPrefixes[randomIndex];
    },

	sayHello: function(personalization) {
        if(personalization) {
            var g = Greeting.simpleGreeting();
            if (g === 'How\'s it going,'){
                return g + ' ' + personalization + '?';
            } else {
                return g + ' ' + personalization;
            }

        } else {
        	return Greeting.simpleGreeting();
        }
    },

    encourageCuriosity: function() {
        // TODO - this can result in an undefined thing
        const randomIndex = Math.floor(Math.random() * (subheadPrefixes.length - 1));

        return subheadPrefixes[randomIndex];
    }
};

export default Greeting;
