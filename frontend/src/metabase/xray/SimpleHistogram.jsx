import React from 'react'

const SimpleHistogram = ({ data }) => {

    const max = Math.max.apply(null, Object.values(data))

    const getHeight = (val) => {
        return val / max * 100
    }

    return (
        <div>
            <ol
                className="flex full mt3"
                style={{
                    height: 120,
                    backgroundImage: `linear-gradient(to top,
                        rgba(0, 0, 0, 0.1) 2%,
                        rgba(0, 0, 0, 0) 2%)`,
                    backgroundSize: `100% ${120/4}px`,
                    backgroundPosition: 'left top',
                }}
            >
                { data && Object.keys(data).map(key =>
                    <li
                        className="relative flex-full bg-brand"
                        style={{
                            marginTop: 'auto',
                            border: '1px solid #fff',
                            height: `${getHeight(data[key])}%`,
                            opacity: 0.85
                        }}
                    >
                        <span
                            className="absolute left text-bold right text-centered"
                            style={{ top: -20 }}
                        >
                            {data[key]}
                        </span>
                    </li>
                )}
            </ol>
            <ol
                className="flex full my2"
            >
                { data && Object.keys(data).map(key =>
                    <li
                        className="flex-full text-bold text-centered"
                    >
                        {key}
                    </li>
                )}
            </ol>
        </div>
    )
}

export default SimpleHistogram
