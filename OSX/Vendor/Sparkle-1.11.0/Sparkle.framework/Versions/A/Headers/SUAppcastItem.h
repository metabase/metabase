//
//  SUAppcastItem.h
//  Sparkle
//
//  Created by Andy Matuschak on 3/12/06.
//  Copyright 2006 Andy Matuschak. All rights reserved.
//

#ifndef SUAPPCASTITEM_H
#define SUAPPCASTITEM_H

#import <Foundation/Foundation.h>
#import "SUExport.h"

SU_EXPORT @interface SUAppcastItem : NSObject
@property (copy, readonly) NSString *title;
@property (copy, readonly) NSDate *date;
@property (copy, readonly) NSString *itemDescription;
@property (strong, readonly) NSURL *releaseNotesURL;
@property (copy, readonly) NSString *DSASignature;
@property (copy, readonly) NSString *minimumSystemVersion;
@property (copy, readonly) NSString *maximumSystemVersion;
@property (strong, readonly) NSURL *fileURL;
@property (copy, readonly) NSString *versionString;
@property (copy, readonly) NSString *displayVersionString;
@property (copy, readonly) NSDictionary *deltaUpdates;
@property (strong, readonly) NSURL *infoURL;

// Initializes with data from a dictionary provided by the RSS class.
- (instancetype)initWithDictionary:(NSDictionary *)dict;
- (instancetype)initWithDictionary:(NSDictionary *)dict failureReason:(NSString **)error;

@property (getter=isDeltaUpdate, readonly) BOOL deltaUpdate;
@property (getter=isCriticalUpdate, readonly) BOOL criticalUpdate;

// Returns the dictionary provided in initWithDictionary; this might be useful later for extensions.
@property (readonly, copy) NSDictionary *propertiesDictionary;

- (NSURL *)infoURL;

@end

#endif
