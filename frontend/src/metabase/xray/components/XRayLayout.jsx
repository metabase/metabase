import React from 'react'

// A small wrapper to get consistent page structure
export const XRayPageWrapper = ({ children }) =>
    <div className="wrapper bg-slate-extra-light pb4 full-height" style={{ paddingLeft: '6em', paddingRight: '6em' }}>
        { children }
    </div>


// A unified heading for XRay pages
export const Heading = ({ heading }) =>
    <h2 className="py3" style={{ color: '#93A1AB'}}>
        {heading}
    </h2>
