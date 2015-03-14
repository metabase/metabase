'use strict';

var gulp = require('gulp'),
    concat = require('gulp-concat'),
    react = require('gulp-react'),
    myth = require('gulp-myth');

var basePath = 'resources/frontend_client/app/';

var SRC = {
    css: [basePath + 'css/**/*.css', basePath + 'components/**/*.css'],
    jsx: [basePath + 'query_builder/*.js']
};

var DEST = {
    css: '' + basePath + '/dist',
    js: '' + basePath + '/dist',
};


/*
  CSS compilation
  1. get all css files in components directory specified in SRC.css
     --------------------
     this way we don't need to have a single 'app.css' or similar
     to combine all our css (our build system should do this for us)

  2. run the css through myth to generate browse compatible css
  3. minify the css
  4. write to DEST.css directory
*/

gulp.task('css', function(){
    return gulp.src(SRC.css)
            .pipe(concat('corvus.css'))
            .pipe(myth())
            .pipe(gulp.dest(DEST.css));
});

gulp.task('jsx', function () {
    return gulp.src(SRC.jsx)
        .pipe(react())
        .pipe(gulp.dest(DEST.js))
})


gulp.task('watch', function(){
    gulp.watch(SRC.css, ['css']);
    gulp.watch(SRC.jsx, ['jsx']);
});


gulp.task('build', ['css', 'jsx']);

gulp.task('default', ['build','watch', 'jsx']);
