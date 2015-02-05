'use strict';

var gulp = require('gulp'),
    concat = require('gulp-concat'),
    myth = require('gulp-myth');

var basePath = 'frontend_client/app/';

var SRC = {
    css: [basePath + 'css/**/*.css', basePath + 'components/**/*.css']
};

var DEST = {
    css: '' + basePath + '/dist'
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

gulp.task('watch', function(){
    gulp.watch(SRC.css, ['css']);
});


gulp.task('build', ['css']);

gulp.task('default', ['build','watch']);
