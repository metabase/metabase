import cxs from "cxs";
import React from 'react'

const SURFACE_BORDER_COLOR = '#DCE1E4'

const Surface = ({ children }) =>
    <div className={cxs({
        backgroundColor: '#fff',
        border: `1px solid ${SURFACE_BORDER_COLOR}`
    })}>
        { children }
    </div>

export default Surface
