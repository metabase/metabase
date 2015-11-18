//
//  SUExport.h
//  Sparkle
//
//  Created by Jake Petroules on 2014-08-23.
//  Copyright (c) 2014 Sparkle Project. All rights reserved.
//

#ifndef SUEXPORT_H
#define SUEXPORT_H

#ifdef BUILDING_SPARKLE
#define SU_EXPORT __attribute__((visibility("default")))
#else
#define SU_EXPORT
#endif

#endif
