class TawassuVoicePlayback extends AudioWorkletProcessor{
  constructor(){super();this.queue=[];this.offset=0;this.port.onmessage=event=>{if(event.data?.type==='clear'){this.queue=[];this.offset=0;return}const samples=event.data?.samples??event.data;if(samples instanceof Float32Array&&samples.length)this.queue.push(samples)}}
  process(inputs,outputs){const channel=outputs[0]?.[0];if(!channel)return true;let outIndex=0;while(outIndex<channel.length&&this.queue.length){const current=this.queue[0],count=Math.min(channel.length-outIndex,current.length-this.offset);channel.set(current.subarray(this.offset,this.offset+count),outIndex);outIndex+=count;this.offset+=count;if(this.offset>=current.length){this.queue.shift();this.offset=0}}if(outIndex<channel.length)channel.fill(0,outIndex);return true}
}
registerProcessor('tawassu-voice-playback',TawassuVoicePlayback);
