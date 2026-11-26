export interface DocTocItem {
  level: number;
  text: string;
  slug: string;
}

export interface DocPage {
  id: string;
  group: string;
  title: string;
  shortTitle: string;
  sourceFile: string;
  toc: DocTocItem[];
  html: string;
  excerpt: string;
  searchText: string;
}

export interface ParamSpec {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: unknown;
  aliases: string[];
  description: string;
}

export interface ActionItem {
  id: string;
  kind: 'action';
  method: 'POST';
  path: string;
  name: string;
  aliases: string[];
  category: string;
  section: string;
  docId: string;
  docAnchor: string;
  summary: string;
  paramsRaw: string;
  params: ParamSpec[];
  returnsRaw: string;
  returns: string;
  notes: string;
  exampleBody: Record<string, unknown>;
  mockResponse: unknown;
}

export interface DirectEndpoint {
  id: string;
  kind: 'http';
  method: 'GET' | 'POST';
  path: string;
  name: string;
  aliases: string[];
  category: string;
  section: string;
  docId: string;
  docAnchor: string;
  summary: string;
  auth: string;
  params: ParamSpec[];
  returns: string;
  notes: string;
  exampleBody: Record<string, unknown> | null;
  mockResponse: unknown;
}

export interface PushEventField {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface PushEvent {
  id: string;
  kind: 'event';
  method: 'EVENT';
  path: string;
  name: string;
  title: string;
  category: string;
  channels: string[];
  discriminator: Record<string, string>;
  docId: string;
  docAnchor: string;
  summary: string;
  fields: PushEventField[];
  payload: Record<string, unknown>;
}

export type StudioEntry = ActionItem | DirectEndpoint | PushEvent;

export interface SegmentItem {
  type: string;
  fields: string;
  desc: string;
  example: Record<string, unknown>;
  cq: string;
}

export interface RetcodeItem {
  code: number;
  status: string;
  meaning: string;
}

export interface SiteData {
  version: string;
  syncedAt: string;
  stats: {
    docCount: number;
    actionCount: number;
    aliasCount: number;
    directEndpointCount: number;
    eventCount: number;
    excludedCount: number;
  };
  docs: DocPage[];
  actions: ActionItem[];
  directEndpoints: DirectEndpoint[];
  pushEvents: PushEvent[];
  segments: {
    receive: SegmentItem[];
    send: SegmentItem[];
  };
  retcodes: RetcodeItem[];
}
