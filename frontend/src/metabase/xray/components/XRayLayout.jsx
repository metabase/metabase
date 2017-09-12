import React from 'react'
import { withBackground } from 'metabase/hoc/Background'

// A small wrapper to get consistent page structure
export const XRayPageWrapper = withBackground('bg-slate-extra-light')(({ children }) =>
    <div className="XRayPageWrapper wrapper pb4 full-height">
        { children }
    </div>
)


// A unified heading for XRay pages
export const Heading = ({ heading }) =>
    <h2 className="py3" style={{ color: '#93A1AB'}}>
        {heading}
    </h2>
