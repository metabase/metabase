//
//  JavaTask.m
//  Metabase
//
//  Created by Cam Saul on 11/24/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

#import "JavaTask.h"

NSString *JREPath() {
	return [[NSBundle mainBundle] pathForResource:@"java" ofType:nil inDirectory:@"jre/bin"];
}

NSString *UberjarPath() {
	return [[NSBundle mainBundle] pathForResource:@"metabase" ofType:@"jar"];
}

NSString *ApplicationSupportDirPath() {
	NSString *applicationSupportDir = [NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, YES)[0] stringByAppendingPathComponent:@"Metabase"];
	if (![[NSFileManager defaultManager] fileExistsAtPath:applicationSupportDir]) {
		NSError *error = nil;
		[[NSFileManager defaultManager] createDirectoryAtPath:applicationSupportDir withIntermediateDirectories:YES attributes:nil error:&error];
		if (error) {
			NSLog(@"Error creating %@: %@", applicationSupportDir, error.localizedDescription);
		}
	}
	return applicationSupportDir;
}

NSString *DBPath() {
	return [ApplicationSupportDirPath() stringByAppendingPathComponent:@"metabase.db"];
}

NSString *PluginsDirPath() {
	return [ApplicationSupportDirPath() stringByAppendingPathComponent:@"Plugins"];
}


@interface JavaTask ()
@property (nonatomic, strong) NSPipe *pipe;
@property (nonatomic, strong) NSFileHandle *readHandle;
@end

@implementation JavaTask

- (void)dealloc {
	[self terminate];
}



#pragma mark - Local Methods

- (void)readHandleDidReadData:(NSData *)data {
	NSString *message = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
	if (!message.length) return;
	
	[self readHandleDidRead:message];
}

- (void)readHandleDidRead:(NSString *)message {}

- (void)terminate {
	if (!self.task) return; // already dead
	
	NSLog(@"Killing %@ @ 0x%zx...", [self class], (size_t)self);
	self.task = nil;
}


#pragma mark - Getters / Setters

- (void)setTask:(NSTask *)task {
	self.pipe = nil;
	
	[_task terminate];
	_task = task;
	
	if (task) {
		self.pipe			= [NSPipe pipe];
		task.standardOutput = self.pipe;
		task.standardError	= self.pipe;
	}
}

- (void)setPipe:(NSPipe *)pipe {
	self.readHandle = nil;
	
	_pipe = pipe;
	
	if (pipe) {
		self.readHandle = pipe.fileHandleForReading;
	}
}

- (void)setReadHandle:(NSFileHandle *)readHandle {
	[_readHandle closeFile];
	
	_readHandle = readHandle;
	
	if (readHandle) {
		__weak JavaTask *weakSelf = self;
		dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_LOW, 0), ^{
			while (readHandle == weakSelf.readHandle) {
				NSData *data = readHandle.availableData;
				if (!data.length) return;
				
				[weakSelf readHandleDidReadData:data];
			}
		});
	}
}

@end
