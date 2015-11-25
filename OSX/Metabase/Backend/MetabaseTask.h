//
//  MetabaseTask.h
//  Metabase
//
//  Created by Cam Saul on 10/9/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

#import "JavaTask.h"

/// Task for running the MetabaseServer
@interface MetabaseTask : JavaTask

/// Create (and launch) a task to run the Metabase backend server.
+ (MetabaseTask *)task;

- (void)launch;

- (NSUInteger)port;

@end
