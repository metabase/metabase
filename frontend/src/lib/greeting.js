const greetingPrefixes = [
    'Hey there,',
    'How\'s it going,',
    'Howdy,',
    'Greetings,',
    'Good to see you,',
];

const subheadPrefixes = [
    'What do you want to know?',
    'What\'s on your mind?',
    'What do you want to find out?',
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
