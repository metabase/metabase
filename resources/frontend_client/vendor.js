/*global window*/

"use strict";

// angular:
import 'angular';
import 'angular-animate';
import 'angular-cookies/angular-cookies';
import 'angular-resource';
import 'angular-route';
import 'angular-sanitize';

// angular 3rd-party:
import 'angular-bootstrap';
import 'angular-cookie';
import 'angular-gridster';
// import 'angular-http-auth'; // not in npm and no package.json: https://github.com/witoldsz/angular-http-auth/pull/100
import 'angular-readable-time/angular-readable-time';
import 'angular-xeditable/dist/js/xeditable';
import 'ng-sortable/dist/ng-sortable';
import 'angularytics';

// ace:
import 'angular-ui-ace';
import 'ace-builds/src-min-noconflict/ace';
import 'ace-builds/src-min-noconflict/ext-language_tools';
import 'ace-builds/src-min-noconflict/mode-sql';
import 'ace-builds/src-min-noconflict/snippets/sql';

// react:
window.React = require('react');
require('react/addons');

// misc:
window._ = require('underscore');
