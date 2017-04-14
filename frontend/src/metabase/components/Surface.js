import cxs from "cxs";
import React from 'react'

const SURFACE_BORDER_COLOR = '#DCE1E4'

const Surface = ({ children }) =>
    <div className={cxs({
        backgroundColor: '#fff',
        border: `1px solid ${SURFACE_BORDER_COLOR}`,
        width: '100%',
        height: '100%',
        borderRadius: 6,
        boxShadow: `0 1px 3px #DCE1E4`,
        overflow: 'hidden',
        cursor: 'pointer',
        ':hover': {
            boxShadow: `0 2px 10px #DCE1E4`,
        }
    })}>
        { children }
    </div>

export default Surface
