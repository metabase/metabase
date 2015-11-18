//
//  SUUnarchiver.h
//  Sparkle
//
//  Created by Andy Matuschak on 3/16/06.
//  Copyright 2006 Andy Matuschak. All rights reserved.
//

#ifndef SUUNARCHIVER_H
#define SUUNARCHIVER_H

#import <Foundation/Foundation.h>

@class SUHost;
@protocol SUUnarchiverDelegate;

@interface SUUnarchiver : NSObject

@property (copy, readonly) NSString *archivePath;
@property (copy, readonly) NSString *updateHostBundlePath;
@property (weak) id<SUUnarchiverDelegate> delegate;

+ (SUUnarchiver *)unarchiverForPath:(NSString *)path updatingHostBundlePath:(NSString *)host;

- (void)start;
@end

@protocol SUUnarchiverDelegate <NSObject>
- (void)unarchiverDidFinish:(SUUnarchiver *)unarchiver;
- (void)unarchiverDidFail:(SUUnarchiver *)unarchiver;
@optional
- (void)unarchiver:(SUUnarchiver *)unarchiver extractedProgress:(double)progress;
@end

#endif
