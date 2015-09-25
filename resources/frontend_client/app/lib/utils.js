'use strict';

// provides functions for building urls to things we care about
var MetabaseUtils = {
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
