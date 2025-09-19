import mongoose from 'mongoose';

const { Schema } = mongoose;

const AnalysisSchema = new Schema({
  // Optional: a filename or URL if you store images elsewhere
  imageName: { type: String },
  // The raw result JSON returned by the AI or a structured summary
  result: { type: Schema.Types.Mixed, required: true },
  // Optional user-supplied notes or metadata
  notes: { type: String },
  // Flags
  referToDerm: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.models.Analysis || mongoose.model('Analysis', AnalysisSchema);
