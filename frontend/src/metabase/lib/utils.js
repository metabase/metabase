import generatePassword from "password-generator";


// provides functions for building urls to things we care about
var MetabaseUtils = {
    generatePassword: function(length, complexity) {
        const len = length || 14;

        if (!complexity) {
            return generatePassword(len, false);
        } else {
            let password = "";
            let tries = 0;
            while(!isStrongEnough(password) && tries < 100) {
                password = generatePassword(len, false, /[\w\d\?\-]/);
                tries++;
            }
            return password;
        }

        function isStrongEnough(password) {
            var uc = password.match(/([A-Z])/g);
            var lc = password.match(/([a-z])/g);
            var di = password.match(/([\d])/g);
            var sc = password.match(/([!@#\$%\^\&*\)\(+=._-{}])/g);

            return (uc && uc.length >= (complexity.upper || 0) &&
                    lc && lc.length >= (complexity.lower || 0) &&
                    di && di.length >= (complexity.digit || 0) &&
                    sc && sc.length >= (complexity.special || 0));
        }
    },

    isEmpty: function(str) {
        return (!str || 0 === str.length);
    },

    // pretty limited.  just does 0-9 for right now.
    numberToWord: function(num) {
        var names = ["zero","one","two","three","four","five","six","seven","eight","nine"];

        if (num >= 0 && num <= 9) {
            return names[num];
        } else {
            return ""+num;
        }
    },

    validEmail: function(email) {
        var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return re.test(email);
    }
}

export default MetabaseUtils;
