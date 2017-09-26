import React from 'react'

const SURVEY_LINK = ''

const PreviewBanner = () =>
    <div className="full py2 md-py3 text-centered text-slate text-paragraph bg-white border-bottom">
        Welcome to the x-ray preview!
        We'd love <a className="link"  href={SURVEY_LINK} target="_blank">your feedback.</a>
    </div>

export default PreviewBanner
